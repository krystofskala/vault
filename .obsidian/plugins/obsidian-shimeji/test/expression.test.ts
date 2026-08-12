import { describe, expect, it } from "vitest";
import { evaluate, evaluateCondition, parseCondition, parseExpression, type ExprContext, type ExprValue } from "../src/shimeji/Expression";

function contextFrom(vars: Record<string, ExprValue>): ExprContext {
	return {
		resolve(path) {
			return vars[path.join(".")];
		},
		call(name, args) {
			if (name === "random") return (typeof args[0] === "number" ? args[0] : 1) / 2;
			return undefined;
		},
	};
}

describe("expression evaluator", () => {
	it("evaluates arithmetic with correct precedence", () => {
		expect(evaluate(parseExpression("2 + 3 * 4"), contextFrom({}))).toBe(14);
		expect(evaluate(parseExpression("(2 + 3) * 4"), contextFrom({}))).toBe(20);
	});

	it("evaluates comparisons and boolean logic", () => {
		expect(evaluate(parseExpression("3 < 5 && 5 > 1"), contextFrom({}))).toBe(true);
		expect(evaluate(parseExpression("3 > 5 || 1 == 1"), contextFrom({}))).toBe(true);
		expect(evaluate(parseExpression("!(1 == 1)"), contextFrom({}))).toBe(false);
	});

	it("evaluates a ternary", () => {
		expect(evaluate(parseExpression("1 < 2 ? 10 : 20"), contextFrom({}))).toBe(10);
	});

	it("resolves dotted identifier paths through the context", () => {
		const ctx = contextFrom({ "mascot.anchor.x": 42 });
		expect(evaluate(parseExpression("mascot.anchor.x"), ctx)).toBe(42);
		expect(evaluate(parseExpression("mascot.anchor.x < 100"), ctx)).toBe(true);
	});

	it("calls functions", () => {
		expect(evaluate(parseExpression("random(10)"), contextFrom({}))).toBe(5);
	});

	it("treats unresolved identifiers as falsy rather than throwing", () => {
		const ctx = contextFrom({});
		expect(evaluate(parseExpression("mascot.somethingUnknown"), ctx)).toBeUndefined();
		expect(evaluateCondition(parseExpression("mascot.somethingUnknown"), ctx)).toBe(false);
	});

	it("parses a wrapped #{...} condition and evaluates it", () => {
		const node = parseCondition("#{mascot.anchor.x < 200}");
		expect(node).toBeDefined();
		expect(evaluateCondition(node, contextFrom({ "mascot.anchor.x": 10 }))).toBe(true);
		expect(evaluateCondition(node, contextFrom({ "mascot.anchor.x": 999 }))).toBe(false);
	});

	it("gracefully defaults to true for unwrapped/unparseable conditions", () => {
		expect(parseCondition("not-a-condition")).toBeUndefined();
		expect(evaluateCondition(parseCondition("not-a-condition"), contextFrom({}))).toBe(true);
		expect(evaluateCondition(undefined, contextFrom({}))).toBe(true);
	});
});
