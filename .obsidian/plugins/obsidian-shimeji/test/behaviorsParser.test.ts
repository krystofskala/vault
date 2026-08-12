import { describe, expect, it } from "vitest";
import { parseBehaviorsXml } from "../src/shimeji/BehaviorsParser";

const FIXTURE_XML = `<?xml version="1.0"?>
<Mascot>
  <BehaviorList>
    <Behavior Name="Fall" Frequency="0" Hidden="true" />
    <Behavior Name="WalkAround" Frequency="100">
      <BehaviorReference Name="SitDown" Add="true" />
    </Behavior>
    <Behavior Name="SitDown" Frequency="50" Condition="#{mascot.grounded}" />
    <Behavior Name="FlatList" Frequency="10" NextBehaviorList="WalkAround, SitDown" />
  </BehaviorList>
</Mascot>`;

describe("parseBehaviorsXml", () => {
	const behaviors = parseBehaviorsXml(FIXTURE_XML);

	it("parses frequency and hidden flags", () => {
		const fall = behaviors.get("Fall");
		expect(fall?.frequency).toBe(0);
		expect(fall?.hidden).toBe(true);
	});

	it("parses a Condition expression", () => {
		expect(behaviors.get("SitDown")?.condition).toBeDefined();
	});

	it("parses child BehaviorReference transitions", () => {
		const walk = behaviors.get("WalkAround");
		expect(walk?.nextBehaviors).toEqual([{ name: "SitDown", add: true }]);
	});

	it("falls back to a flat comma-separated NextBehaviorList attribute", () => {
		const flat = behaviors.get("FlatList");
		expect(flat?.nextBehaviors).toEqual([
			{ name: "WalkAround", add: false },
			{ name: "SitDown", add: false },
		]);
	});
});
