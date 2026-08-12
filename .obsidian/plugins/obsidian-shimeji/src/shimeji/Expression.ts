/**
 * A small, generic expression parser/evaluator for Shimeji-style `#{...}` conditions
 * (e.g. `#{mascot.anchor.x < mascot.environment.workArea.right}`). Deliberately independent
 * of the engine/DOM so it's unit-testable; the caller supplies an ExprContext that resolves
 * dotted property paths and function calls against whatever runtime state it wants to expose.
 */

export type ExprValue = number | string | boolean | undefined;

export interface ExprContext {
	resolve(path: string[]): ExprValue;
	call(name: string, args: ExprValue[]): ExprValue;
}

export type Node =
	| { kind: "num"; value: number }
	| { kind: "str"; value: string }
	| { kind: "bool"; value: boolean }
	| { kind: "path"; parts: string[] }
	| { kind: "call"; name: string; args: Node[] }
	| { kind: "unary"; op: "-" | "!"; expr: Node }
	| { kind: "binary"; op: string; left: Node; right: Node }
	| { kind: "ternary"; cond: Node; then: Node; otherwise: Node };

type TokenType = "num" | "str" | "ident" | "op" | "lparen" | "rparen" | "comma" | "dot" | "question" | "colon" | "eof";
interface Token {
	type: TokenType;
	value: string;
}

const MULTI_CHAR_OPS = ["<=", ">=", "==", "!=", "&&", "||"];

function tokenize(src: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	while (i < src.length) {
		const c = src[i];
		if (/\s/.test(c)) {
			i++;
			continue;
		}
		if (c === "(") {
			tokens.push({ type: "lparen", value: c });
			i++;
			continue;
		}
		if (c === ")") {
			tokens.push({ type: "rparen", value: c });
			i++;
			continue;
		}
		if (c === ",") {
			tokens.push({ type: "comma", value: c });
			i++;
			continue;
		}
		if (c === "?") {
			tokens.push({ type: "question", value: c });
			i++;
			continue;
		}
		if (c === ":") {
			tokens.push({ type: "colon", value: c });
			i++;
			continue;
		}
		if (c === ".") {
			tokens.push({ type: "dot", value: c });
			i++;
			continue;
		}
		if (c === '"' || c === "'") {
			const quote = c;
			let j = i + 1;
			let str = "";
			while (j < src.length && src[j] !== quote) {
				str += src[j];
				j++;
			}
			tokens.push({ type: "str", value: str });
			i = j + 1;
			continue;
		}
		if (/[0-9]/.test(c)) {
			let j = i;
			while (j < src.length && /[0-9.]/.test(src[j])) j++;
			tokens.push({ type: "num", value: src.slice(i, j) });
			i = j;
			continue;
		}
		if (/[A-Za-z_]/.test(c)) {
			let j = i;
			while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
			tokens.push({ type: "ident", value: src.slice(i, j) });
			i = j;
			continue;
		}
		const two = src.slice(i, i + 2);
		if (MULTI_CHAR_OPS.includes(two)) {
			tokens.push({ type: "op", value: two });
			i += 2;
			continue;
		}
		if ("<>+-*/!".includes(c)) {
			tokens.push({ type: "op", value: c });
			i++;
			continue;
		}
		throw new Error(`Unexpected character '${c}' at position ${i}`);
	}
	tokens.push({ type: "eof", value: "" });
	return tokens;
}

class Parser {
	private pos = 0;

	constructor(private tokens: Token[]) {}

	private peek(): Token {
		return this.tokens[this.pos];
	}

	private take(): Token {
		return this.tokens[this.pos++];
	}

	private expect(type: TokenType): Token {
		const tok = this.take();
		if (tok.type !== type) throw new Error(`Expected ${type} but got ${tok.type} ('${tok.value}')`);
		return tok;
	}

	parseExpression(): Node {
		const node = this.parseTernary();
		this.expect("eof");
		return node;
	}

	private parseTernary(): Node {
		const cond = this.parseOr();
		if (this.peek().type === "question") {
			this.take();
			const then = this.parseTernary();
			this.expect("colon");
			const otherwise = this.parseTernary();
			return { kind: "ternary", cond, then, otherwise };
		}
		return cond;
	}

	private parseOr(): Node {
		let left = this.parseAnd();
		while (this.peek().type === "op" && this.peek().value === "||") {
			this.take();
			left = { kind: "binary", op: "||", left, right: this.parseAnd() };
		}
		return left;
	}

	private parseAnd(): Node {
		let left = this.parseEquality();
		while (this.peek().type === "op" && this.peek().value === "&&") {
			this.take();
			left = { kind: "binary", op: "&&", left, right: this.parseEquality() };
		}
		return left;
	}

	private parseEquality(): Node {
		let left = this.parseRelational();
		while (this.peek().type === "op" && ["==", "!="].includes(this.peek().value)) {
			const op = this.take().value;
			left = { kind: "binary", op, left, right: this.parseRelational() };
		}
		return left;
	}

	private parseRelational(): Node {
		let left = this.parseAdditive();
		while (this.peek().type === "op" && ["<", "<=", ">", ">="].includes(this.peek().value)) {
			const op = this.take().value;
			left = { kind: "binary", op, left, right: this.parseAdditive() };
		}
		return left;
	}

	private parseAdditive(): Node {
		let left = this.parseMultiplicative();
		while (this.peek().type === "op" && ["+", "-"].includes(this.peek().value)) {
			const op = this.take().value;
			left = { kind: "binary", op, left, right: this.parseMultiplicative() };
		}
		return left;
	}

	private parseMultiplicative(): Node {
		let left = this.parseUnary();
		while (this.peek().type === "op" && ["*", "/"].includes(this.peek().value)) {
			const op = this.take().value;
			left = { kind: "binary", op, left, right: this.parseUnary() };
		}
		return left;
	}

	private parseUnary(): Node {
		if (this.peek().type === "op" && (this.peek().value === "-" || this.peek().value === "!")) {
			const op = this.take().value as "-" | "!";
			return { kind: "unary", op, expr: this.parseUnary() };
		}
		return this.parsePrimary();
	}

	private parsePrimary(): Node {
		const tok = this.peek();
		if (tok.type === "num") {
			this.take();
			return { kind: "num", value: parseFloat(tok.value) };
		}
		if (tok.type === "str") {
			this.take();
			return { kind: "str", value: tok.value };
		}
		if (tok.type === "lparen") {
			this.take();
			const inner = this.parseTernary();
			this.expect("rparen");
			return inner;
		}
		if (tok.type === "ident") {
			if (tok.value === "true" || tok.value === "false") {
				this.take();
				return { kind: "bool", value: tok.value === "true" };
			}
			const parts = [this.take().value];
			while (this.peek().type === "dot") {
				this.take();
				parts.push(this.expect("ident").value);
			}
			if (this.peek().type === "lparen") {
				this.take();
				const args: Node[] = [];
				while (this.peek().type !== "rparen") {
					args.push(this.parseTernary());
					if (this.peek().type === "comma") this.take();
				}
				this.expect("rparen");
				return { kind: "call", name: parts.join("."), args };
			}
			return { kind: "path", parts };
		}
		throw new Error(`Unexpected token '${tok.value}' (${tok.type})`);
	}
}

export function parseExpression(source: string): Node {
	return new Parser(tokenize(source)).parseExpression();
}

function truthy(v: ExprValue): boolean {
	if (typeof v === "boolean") return v;
	if (typeof v === "number") return v !== 0;
	if (typeof v === "string") return v.length > 0;
	return false;
}

function toNumber(v: ExprValue): number {
	if (typeof v === "number") return v;
	if (typeof v === "boolean") return v ? 1 : 0;
	if (typeof v === "string") return parseFloat(v) || 0;
	return 0;
}

export function evaluate(node: Node, ctx: ExprContext): ExprValue {
	switch (node.kind) {
		case "num":
			return node.value;
		case "str":
			return node.value;
		case "bool":
			return node.value;
		case "path":
			return ctx.resolve(node.parts);
		case "call":
			return ctx.call(node.name, node.args.map((a) => evaluate(a, ctx)));
		case "unary": {
			const v = evaluate(node.expr, ctx);
			return node.op === "-" ? -toNumber(v) : !truthy(v);
		}
		case "ternary":
			return truthy(evaluate(node.cond, ctx)) ? evaluate(node.then, ctx) : evaluate(node.otherwise, ctx);
		case "binary": {
			if (node.op === "&&") return truthy(evaluate(node.left, ctx)) && truthy(evaluate(node.right, ctx));
			if (node.op === "||") return truthy(evaluate(node.left, ctx)) || truthy(evaluate(node.right, ctx));
			const l = evaluate(node.left, ctx);
			const r = evaluate(node.right, ctx);
			switch (node.op) {
				case "==":
					return l === r;
				case "!=":
					return l !== r;
				case "<":
					return toNumber(l) < toNumber(r);
				case "<=":
					return toNumber(l) <= toNumber(r);
				case ">":
					return toNumber(l) > toNumber(r);
				case ">=":
					return toNumber(l) >= toNumber(r);
				case "+":
					return typeof l === "string" || typeof r === "string" ? `${l ?? ""}${r ?? ""}` : toNumber(l) + toNumber(r);
				case "-":
					return toNumber(l) - toNumber(r);
				case "*":
					return toNumber(l) * toNumber(r);
				case "/":
					return toNumber(l) / toNumber(r);
				default:
					throw new Error(`Unknown operator '${node.op}'`);
			}
		}
	}
}

// Real packs use both wrappers, and they're not actually interchangeable: the real engine
// (Script.java) compiles/runs both as JS, but "#{...}" re-evaluates fresh every tick while
// "${...}" evaluates once and caches for the rest of the action's lifetime. We treat both
// wrappers as the same syntax here (parsing doesn't need to know which), but callers that
// evaluate the result MUST NOT assume it's safe to cache across ticks unless they know the
// call site only ever runs once per action instance anyway — see ActionRunner's
// currentPoses()/chooseAnimation() (re-evaluated every tick, matching "#{...}"'s usual home:
// <Animation Condition>) vs resolveLocals() (evaluated once per pushAction, matching
// "${...}"'s usual home: Duration/TargetX/BornX/... on an ActionReference).
export const EXPR_WRAPPER = /^[#$]\{([\s\S]*)\}$/;
const warnedConditions = new Set<string>();

/** Parses a `Condition="#{...}"` / `Condition="${...}"` attribute value. Returns undefined
 * (and logs once) on anything unrecognized, so an unsupported construct degrades to
 * "always true" rather than breaking the whole imported pack. */
export function parseCondition(raw: string): Node | undefined {
	const match = EXPR_WRAPPER.exec(raw.trim());
	if (!match) {
		warnOnce(`Unrecognized condition syntax, treating as always-true: ${raw}`);
		return undefined;
	}
	try {
		return parseExpression(match[1]);
	} catch (err) {
		warnOnce(`Failed to parse condition, treating as always-true: ${raw} (${(err as Error).message})`);
		return undefined;
	}
}

export function evaluateCondition(node: Node | undefined, ctx: ExprContext): boolean {
	if (!node) return true;
	try {
		return truthy(evaluate(node, ctx));
	} catch (err) {
		warnOnce(`Error evaluating condition at runtime, treating as false: ${(err as Error).message}`);
		return false;
	}
}

/** Parses an ActionReference parameter value (e.g. Duration="${100+Math.random()*100}" or a
 * plain literal like Duration="100" / LookRight="true"). Unlike parseCondition this always
 * returns a usable Node: unwrapped literals become constant nodes. */
export function parseParamValue(raw: string): Node {
	const match = EXPR_WRAPPER.exec(raw.trim());
	if (match) {
		try {
			return parseExpression(match[1]);
		} catch (err) {
			warnOnce(`Failed to parse parameter expression, treating as a literal string: ${raw} (${(err as Error).message})`);
			return { kind: "str", value: raw };
		}
	}
	if (raw === "true" || raw === "false") return { kind: "bool", value: raw === "true" };
	const n = Number(raw);
	if (raw.trim() !== "" && !Number.isNaN(n)) return { kind: "num", value: n };
	return { kind: "str", value: raw };
}

/** Wraps a base context so single-name identifiers (e.g. bare "TargetX") resolve against a
 * per-invocation locals map before falling through to the base context's mascot/environment
 * paths. Used for ActionReference parameters, which real packs reference as bare names. */
export function withLocals(base: ExprContext, locals: Record<string, ExprValue>): ExprContext {
	return {
		resolve(path) {
			if (path.length === 1 && Object.prototype.hasOwnProperty.call(locals, path[0])) return locals[path[0]];
			return base.resolve(path);
		},
		call(name, args) {
			return base.call(name, args);
		},
	};
}

function warnOnce(message: string): void {
	if (warnedConditions.has(message)) return;
	warnedConditions.add(message);
	console.warn(`[obsidian-shimeji] ${message}`);
}
