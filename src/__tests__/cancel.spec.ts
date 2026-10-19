/// <reference types="@rbxts/testez/globals" />

import { MovesetBuilder, MovesetController } from "..";
import { createCharacter, move, record } from "./fixtures";

const dash = move("Dash", { startup: 0, active: 0.125, recovery: 0.125, cooldown: 2 });

export = () => {
	describe("cancel routes", () => {
		it("cancels straight into an allowed action", () => {
			const kit = new MovesetBuilder("Spear")
				.tap("Skill1", move("Thrust", { cancels: [{ into: ["Dash"], during: ["Recovery"] }] }))
				.tap("Dash", dash)
				.build();
			const controller = new MovesetController(kit, createCharacter());
			const log = record(controller);

			controller.press("Skill1");
			controller.update(0.25);
			expect(controller.press("Dash")).to.equal("Started");

			expect(log.join(",")).to.equal("start Thrust,end Thrust Cancelled,start Dash");
		});

		it("holds an early press until the phase that allows the cancel", () => {
			const kit = new MovesetBuilder("Spear")
				.tap("Skill1", move("Thrust", { cancels: [{ into: ["Dash"], during: ["Recovery"] }] }))
				.tap("Dash", dash)
				.build();
			const controller = new MovesetController(kit, createCharacter());

			controller.press("Skill1");
			controller.update(0.0625);
			expect(controller.press("Dash")).to.equal("Buffered");

			controller.update(0.25);
			expect(controller.getMove()?.move.name).to.equal("Dash");
			expect(controller.getMove()?.startedAt).to.equal(0.25);
		});

		it("only allows hit confirm routes after a hit", () => {
			const kit = new MovesetBuilder("Spear")
				.tap("Skill1", move("Thrust", { cancels: [{ into: ["Skill2"], during: ["Recovery"], onHit: true }] }))
				.tap("Skill2", move("Sweep"))
				.bufferWindow(0)
				.build();
			const controller = new MovesetController(kit, createCharacter());

			controller.press("Skill1");
			controller.update(0.25);
			expect(controller.press("Skill2")).to.equal("Busy");

			controller.confirmHit();
			expect(controller.press("Skill2")).to.equal("Started");
		});

		it("applies kit wide routes to every move", () => {
			const kit = new MovesetBuilder("Spear")
				.tap("Skill1", move("Thrust"))
				.tap("Skill2", move("Sweep"))
				.tap("Dash", move("Dash", { startup: 0, active: 0.125, recovery: 0.125 }))
				.cancel({ into: ["Dash"], during: ["Startup"] })
				.bufferWindow(0)
				.build();
			const controller = new MovesetController(kit, createCharacter());

			controller.press("Skill1");
			expect(controller.press("Dash")).to.equal("Started");
			controller.update(0.25);

			controller.press("Skill2");
			expect(controller.press("Dash")).to.equal("Started");
		});

		it("won't cancel into a move that is still on cooldown", () => {
			const kit = new MovesetBuilder("Spear")
				.tap("Skill1", move("Thrust"))
				.tap("Dash", dash)
				.cancel({ into: ["Dash"], during: ["Startup", "Active", "Recovery"] })
				.bufferWindow(0)
				.build();
			const controller = new MovesetController(kit, createCharacter());

			controller.press("Dash");
			controller.update(0.25);
			controller.press("Skill1");

			expect(controller.press("Dash")).to.equal("Cooldown");
			expect(controller.getMove()?.move.name).to.equal("Thrust");
		});

		it("does not cancel outside the listed phases", () => {
			const kit = new MovesetBuilder("Spear")
				.tap("Skill1", move("Thrust", { cancels: [{ into: ["Dash"], during: ["Startup"] }] }))
				.tap("Dash", dash)
				.bufferWindow(0)
				.build();
			const controller = new MovesetController(kit, createCharacter());

			controller.press("Skill1");
			controller.update(0.125);
			expect(controller.getPhase()).to.equal("Active");
			expect(controller.press("Dash")).to.equal("Busy");
		});
	});
};
