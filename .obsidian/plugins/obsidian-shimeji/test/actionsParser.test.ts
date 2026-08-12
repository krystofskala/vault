import { describe, expect, it } from "vitest";
import { parseActionsXml } from "../src/shimeji/ActionsParser";

const FIXTURE_XML = `<?xml version="1.0"?>
<Mascot>
  <ActionList>
    <Action Name="Stand" Type="Animate" BorderType="Floor">
      <Animation>
        <Pose Image="/pose1.png" ImageAnchor="32,64" Duration="500" />
      </Animation>
    </Action>
    <Action Name="WalkLoop" Type="Move" Loop="true">
      <Animation>
        <Pose Image="/pose2.png" ImageAnchor="32,64" Velocity="4,0" Duration="90" />
        <Pose Image="/pose3.png" ImageAnchor="32,64" Velocity="4,0" Duration="90" />
      </Animation>
    </Action>
    <Action Name="IdleThenWalk" Type="Sequence">
      <ActionReference Name="Stand" />
      <ActionReference Name="WalkLoop" />
    </Action>
    <Action Name="PickASide" Type="Select">
      <ActionReference Name="Stand" Condition="#{mascot.anchor.x &lt; 100}" />
      <ActionReference Name="WalkLoop" />
    </Action>
    <Action Name="Fall" Type="Embedded" BorderType="Floor">
      <Animation>
        <Pose Image="/falling.png" ImageAnchor="32,64" Duration="100" />
      </Animation>
    </Action>
    <Action Name="Weird" Type="TotallyMadeUp">
      <Animation><Pose Image="/x.png" Duration="10" /></Animation>
    </Action>
    <Action Type="Animate">
      <Animation><Pose Image="/no-name.png" Duration="10" /></Animation>
    </Action>
  </ActionList>
</Mascot>`;

describe("parseActionsXml", () => {
	const actions = parseActionsXml(FIXTURE_XML);

	it("parses Animate poses with anchor/velocity/duration", () => {
		const stand = actions.get("Stand");
		expect(stand?.type).toBe("Animate");
		expect(stand?.borderType).toBe("Floor");
		expect(stand?.poses).toEqual([{ image: "/pose1.png", anchor: { x: 32, y: 64 }, velocity: undefined, durationMs: 500 }]);
	});

	it("parses Move poses with velocity and Loop", () => {
		const walk = actions.get("WalkLoop");
		expect(walk?.type).toBe("Move");
		expect(walk?.loop).toBe(true);
		expect(walk?.poses).toHaveLength(2);
		expect(walk?.poses[0].velocity).toEqual({ x: 4, y: 0 });
	});

	it("parses Sequence children in order", () => {
		const seq = actions.get("IdleThenWalk");
		expect(seq?.type).toBe("Sequence");
		expect(seq?.children.map((c) => c.name)).toEqual(["Stand", "WalkLoop"]);
	});

	it("parses Select children with a Condition expression", () => {
		const select = actions.get("PickASide");
		expect(select?.type).toBe("Select");
		expect(select?.children[0].condition).toBeDefined();
		expect(select?.children[1].condition).toBeUndefined();
	});

	it("marks Embedded actions with an embeddedName and still keeps their poses", () => {
		const fall = actions.get("Fall");
		expect(fall?.type).toBe("Embedded");
		expect(fall?.embeddedName).toBe("Fall");
		expect(fall?.poses).toHaveLength(1);
	});

	it("falls back unknown Type values to Stay instead of throwing", () => {
		expect(actions.get("Weird")?.type).toBe("Stay");
	});

	it("skips Action elements without a Name", () => {
		expect(actions.size).toBe(6);
	});
});
