/*
 * Templater user script.
 *
 * Vybere jeden dosud nepoužitý blunder z tvých analyzovaných partií na Lichess
 * (stejný princip jako lichess "Poučte se ze svých chyb") a vrátí callout
 * s odkazem na přesný tah na Lichess a náhledem partie přes Chesser.
 *
 * Použití v šabloně (Templater):
 *   <%* tR += await tp.user.lichessBlunderCallout(tp) %>
 *
 * Nastavení: viz "Lichess Blunder Callout - Setup.md" ve vaultu.
 */

const CONFIG_PATH = "_data/lichess-config.json";
const STATE_PATH = "_data/lichess-blunders-used.json";

module.exports = async function lichessBlunderCallout(tp) {
	const { requestUrl } = require("obsidian");
	const app = tp.app;

	const config = await readJson(app, CONFIG_PATH);
	if (!config || !config.username) {
		return warningCallout(
			`Chybí nebo je neplatný soubor \`${CONFIG_PATH}\`. Vytvoř ho podle "Lichess Blunder Callout - Setup" (musí obsahovat aspoň "username").`
		);
	}

	const username = config.username;
	const gamesPerFetch = config.gamesPerFetch || 50;
	const maxFetchRounds = config.maxFetchRounds || 4;

	const used = new Set((await readJson(app, STATE_PATH)) || []);

	let until;
	let candidate = null;

	try {
		for (let round = 0; round < maxFetchRounds && !candidate; round++) {
			const games = await fetchAnalysedGames(requestUrl, config, gamesPerFetch, until);
			if (games.length === 0) break;

			until = games[games.length - 1].createdAt - 1;

			const candidates = collectUnusedBlunders(games, username, used);
			if (candidates.length > 0) {
				candidate = candidates[Math.floor(Math.random() * candidates.length)];
			}
		}
	} catch (err) {
		return warningCallout(`Chyba při komunikaci s Lichess API: ${err.message}`);
	}

	if (!candidate) {
		return infoCallout(
			"Nenašel jsem žádný nový blunder (buď nemáš analyzované partie, nebo jsou všechny už použité)."
		);
	}

	used.add(candidate.key);
	await writeJson(app, STATE_PATH, [...used]);

	return renderCallout(candidate);
};

async function readJson(app, path) {
	try {
		const raw = await app.vault.adapter.read(path);
		return JSON.parse(raw);
	} catch (e) {
		return null;
	}
}

async function writeJson(app, path, data) {
	const folder = path.split("/").slice(0, -1).join("/");
	if (folder && !(await app.vault.adapter.exists(folder))) {
		await app.vault.adapter.mkdir(folder);
	}
	await app.vault.adapter.write(path, JSON.stringify(data, null, 2));
}

async function fetchAnalysedGames(requestUrl, config, max, until) {
	const params = new URLSearchParams({
		max: String(max),
		analysed: "true",
		moves: "true",
		evals: "true",
		opening: "false",
		clocks: "false",
		tags: "false",
		ongoing: "false",
	});
	if (until) params.set("until", String(until));

	const headers = { Accept: "application/x-ndjson" };
	if (config.token) headers.Authorization = `Bearer ${config.token}`;

	const res = await requestUrl({
		url: `https://lichess.org/api/games/user/${encodeURIComponent(config.username)}?${params}`,
		headers,
		throw: false,
	});

	if (res.status !== 200) {
		throw new Error(`Lichess API vrátilo status ${res.status}`);
	}

	return res.text
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => JSON.parse(line));
}

function userColor(game, username) {
	const lower = username.toLowerCase();
	if (game.players?.white?.user?.name?.toLowerCase() === lower) return "white";
	if (game.players?.black?.user?.name?.toLowerCase() === lower) return "black";
	return null;
}

// Sesbírá všechny bludery hráče "username", které ještě nejsou v `used`
// (klíč je "gameId:ply", takže stejný blunder ze stejné partie se nikdy
// nezopakuje, ale jiný blunder ze stejné partie klidně znovu vybrán být může).
function collectUnusedBlunders(games, username, used) {
	const out = [];
	for (const game of games) {
		const color = userColor(game, username);
		if (!color || !game.analysis || !game.moves) continue;
		const moves = game.moves.split(" ");

		game.analysis.forEach((entry, ply) => {
			if (!entry || !entry.judgment || entry.judgment.name !== "Blunder") return;
			const moveColor = ply % 2 === 0 ? "white" : "black";
			if (moveColor !== color) return;

			const key = `${game.id}:${ply}`;
			if (used.has(key)) return;

			out.push({ key, game, ply, moves, color, entry });
		});
	}
	return out;
}

function toPgnMoveText(moves) {
	let out = "";
	for (let i = 0; i < moves.length; i++) {
		if (i % 2 === 0) out += `${i / 2 + 1}. `;
		out += `${moves[i]} `;
	}
	return out.trim();
}

function formatEval(entry) {
	if (!entry) return "?";
	if (typeof entry.mate === "number") return `#${entry.mate}`;
	if (typeof entry.eval === "number") {
		const pawns = entry.eval / 100;
		return (pawns > 0 ? "+" : "") + pawns.toFixed(2);
	}
	return "?";
}

function opponentName(game, color) {
	const opp = color === "white" ? game.players.black : game.players.white;
	if (opp?.user?.name) return opp.user.name;
	if (typeof opp?.aiLevel === "number") return `Stockfish (level ${opp.aiLevel})`;
	return "?";
}

function renderCallout(candidate) {
	const { game, ply, moves, color, entry } = candidate;
	const moveNumber = Math.floor(ply / 2) + 1;
	const moveNotation = color === "black" ? `${moveNumber}...` : `${moveNumber}.`;
	const san = moves[ply];
	const evalBefore = formatEval(game.analysis[ply - 1]);
	const evalAfter = formatEval(entry);
	const date = new Date(game.createdAt).toLocaleDateString("cs-CZ");
	const opponent = opponentName(game, color);
	// Odkaz na Lichess otevře partii rovnou na tahu, kde byl blunder odehrán.
	const gameUrl = `https://lichess.org/${game.id}/${color}#${ply + 1}`;
	const pgn = toPgnMoveText(moves).replace(/"/g, '\\"');

	const lines = [
		`> [!blunder] Blunder z partie ${date} vs. ${opponent}`,
		`> ${moveNotation} **${san}** (hraješ ${color === "white" ? "bílými" : "černými"}) — ohodnocení ${evalBefore} → ${evalAfter}`,
		`> [Otevřít přesně tento tah na Lichess](${gameUrl})`,
		`>`,
		"> ```chess",
		`> pgn: "${pgn}"`,
		`> orientation: ${color}`,
		"> ```",
	];

	return lines.join("\n");
}

function warningCallout(msg) {
	return `> [!warning] Lichess blunder callout\n> ${msg}`;
}

function infoCallout(msg) {
	return `> [!info] Lichess blunder callout\n> ${msg}`;
}
