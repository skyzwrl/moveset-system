/// <reference types="@rbxts/testez/globals" />

import { Move, MovesetBuilder, MovesetController } from "..";
import { createCharacter, move } from "./fixtures";

function tracedMove(log: string[], overrides: Partial<Move> = {}): Move {
	return move("Slam", {
		onStart: (context) => log.push(`onStart ${context.startedAt}`),
		onActive: () => log.push("onActive"),
		onRecovery: () => log.push("onRecovery"),
		onEnd: (_, reason) => log.push(`onEnd ${reason}`),
		...overrides,
	});
}

export = () => {
	describe("move phases", () => {
		it("runs the callbacks in order as time passes", () => {
			const log = new Array<string>();
			const kit = new MovesetBuilder("Hammer").tap("Skill1", tracedMove(log)).build();
			const controller = new MovesetController(kit, createCharacter());

			controller.press("Skill1");
			expect(log.join(",")).to.equal("onStart 0");
			expect(controller.getPhase()).to.equal("Startup");

			controller.update(0.125);
			expect(controller.getPhase()).to.equal("Active");
			controller.update(0.125);
			expect(controller.getPhase()).to.equal("Recovery");
			controller.update(0.25);

			expect(controller.getPhase()).never.to.be.ok();
			expect(log.join(",")).to.equal("onStart 0,onActive,onRecovery,onEnd Completed");
		});

		it("still runs every callback when one update skips the whole move", () => {
			const log = new Array<string>();
			const kit = new MovesetBuilder("Hammer").tap("Skill1", tracedMove(log)).build();
			const controller = new MovesetController(kit, createCharacter());
			const phases = new Array<string>();
			controller.phaseChanged.connect((_, phase) => phases.push(phase));

			controller.press("Skill1");
			controller.update(10);

			expect(log.join(",")).to.equal("onStart 0,onActive,onRecovery,onEnd Completed");
			expect(phases.join(",")).to.equal("Active,Recovery");
		});

		it("goes straight to the active phase when there is no startup", () => {
			const log = new Array<string>();
			const kit = new MovesetBuilder("Hammer").tap("Skill1", tracedMove(log, { startup: 0 })).build();
			const controller = new MovesetController(kit, createCharacter());

			controller.press("Skill1");

			expect(controller.getPhase()).to.equal("Active");
			expect(log.join(",")).to.equal("onStart 0,onActive");
		});

		it("lets a callback interrupt its own move", () => {
			const log = new Array<string>();
			const kit = new MovesetBuilder("Hammer")
				.tap("Skill1", tracedMove(log, { onActive: () => controller.interrupt() }))
				.build();
			const controller = new MovesetController(kit, createCharacter());
			const phases = new Array<string>();
			controller.phaseChanged.connect((_, phase) => phases.push(phase));

			controller.press("Skill1");
			controller.update(1);

			expect(log.join(",")).to.equal("onStart 0,onEnd Interrupted");
			expect(phases.size()).to.equal(0);
			expect(controller.getMove()).never.to.be.ok();
		});

		it("only confirms hits while a move is running", () => {
			const kit = new MovesetBuilder("Hammer").tap("Skill1", move("Slam")).build();
			const controller = new MovesetController(kit, createCharacter());

			expect(controller.confirmHit()).to.equal(false);
			controller.press("Skill1");
			expect(controller.confirmHit()).to.equal(true);
		});

		it("ignores negative time steps", () => {
			const kit = new MovesetBuilder("Hammer").tap("Skill1", move("Slam")).build();
			const controller = new MovesetController(kit, createCharacter());

			controller.press("Skill1");
			controller.update(0.125);
			controller.update(-1);
			controller.update(0.125);

			expect(controller.getPhase()).to.equal("Recovery");
		});
	});
};
