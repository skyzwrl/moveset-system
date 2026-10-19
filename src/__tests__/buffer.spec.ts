/// <reference types="@rbxts/testez/globals" />

import { MovesetBuilder, MovesetController } from "..";
import { createCharacter, move, started } from "./fixtures";

function kit(bufferWindow = 0.2) {
	return new MovesetBuilder("Fists")
		.tap("Skill1", move("Jab"))
		.tap("Skill2", move("Hook"))
		.tap("Skill3", move("Uppercut"))
		.tap("Skill4", move("Palm", { startup: 0, active: 0.0625, recovery: 0.0625, cooldown: 0.5 }))
		.bufferWindow(bufferWindow)
		.build();
}

export = () => {
	describe("input buffering", () => {
		it("fires a press made during recovery the moment the move ends", () => {
			const controller = new MovesetController(kit(), createCharacter());

			controller.press("Skill1");
			controller.update(0.375);
			expect(controller.press("Skill2")).to.equal("Buffered");

			controller.update(0.25);
			const current = controller.getMove();
			expect(current?.move.name).to.equal("Hook");
			expect(current?.startedAt).to.equal(0.5);
		});

		it("drops the press once the window runs out", () => {
			const controller = new MovesetController(kit(0.125), createCharacter());
			const names = started(controller);

			controller.press("Skill1");
			controller.update(0.25);
			controller.press("Skill2");
			controller.update(0.5);

			expect(names.join(",")).to.equal("Jab");
			expect(controller.getMove()).never.to.be.ok();
		});

		it("keeps only the latest press", () => {
			const controller = new MovesetController(kit(), createCharacter());
			const names = started(controller);

			controller.press("Skill1");
			controller.update(0.375);
			controller.press("Skill2");
			controller.press("Skill3");
			controller.update(0.125);

			expect(names.join(",")).to.equal("Jab,Uppercut");
		});

		it("fires when a cooldown comes back inside the window", () => {
			const controller = new MovesetController(kit(), createCharacter());

			controller.press("Skill4");
			controller.update(0.375);
			expect(controller.press("Skill4")).to.equal("Buffered");

			controller.update(0.1875);
			expect(controller.getMove()?.startedAt).to.equal(0.5);
		});

		it("carries leftover time into the buffered move", () => {
			const run = (steps: number) => {
				const controller = new MovesetController(kit(), createCharacter());
				const log = new Array<string>();
				controller.phaseChanged.connect((context, phase) => log.push(`${context.move.name} ${phase}`));
				controller.moveEnded.connect((context, reason) => log.push(`${context.move.name} ${reason}`));

				controller.press("Skill1");
				controller.update(0.375);
				controller.press("Skill2");
				for (let step = 0; step < steps; step++) {
					controller.update(0.5 / steps);
				}
				return `${log.join(",")} | ${controller.getPhase()}`;
			};

			const oneStep = run(1);
			expect(oneStep).to.equal("Jab Active,Jab Recovery,Jab Completed,Hook Active,Hook Recovery | Recovery");
			expect(run(8)).to.equal(oneStep);
			expect(run(32)).to.equal(oneStep);
		});

		it("reports the block reason instead of buffering when the window is zero", () => {
			const controller = new MovesetController(kit(0), createCharacter());

			controller.press("Skill1");
			expect(controller.press("Skill2")).to.equal("Busy");
			controller.update(0.5);
			expect(controller.press("Skill2")).to.equal("Started");
		});
	});
};
