/// <reference types="@rbxts/testez/globals" />

import { MovesetBuilder, MovesetController } from "..";
import { createCharacter, move, started } from "./fixtures";

function kit() {
	return new MovesetBuilder("Greatsword")
		.tap("Skill1", move("Cleave"))
		.tap("Skill2", move("Kick"))
		.hold("Skill2", move("Whirlwind"), 0.25)
		.charge("Skill3", move("Piercer"), 0.125, 0.625)
		.tap("Skill4", move("Pommel"))
		.charge("Skill4", move("Earthsplitter"), 0.25, 1.25)
		.build();
}

export = () => {
	describe("tap, hold and charge", () => {
		it("fires taps on press when the action has nothing bound to holding it", () => {
			const controller = new MovesetController(kit(), createCharacter());

			expect(controller.press("Skill1")).to.equal("Started");
			expect(controller.release("Skill1")).never.to.be.ok();
		});

		it("waits for the release to tell a tap from a hold", () => {
			const controller = new MovesetController(kit(), createCharacter());

			expect(controller.press("Skill2")).to.equal("Held");
			expect(controller.getMove()).never.to.be.ok();

			controller.update(0.125);
			expect(controller.release("Skill2")).to.equal("Started");
			expect(controller.getMove()?.move.name).to.equal("Kick");
		});

		it("fires the hold move at the threshold without waiting for the release", () => {
			const controller = new MovesetController(kit(), createCharacter());
			const names = started(controller);

			controller.press("Skill2");
			controller.update(0.5);

			expect(controller.getMove()?.startedAt).to.equal(0.25);
			expect(controller.getPhase()).to.equal("Recovery");
			expect(controller.release("Skill2")).never.to.be.ok();
			expect(names.join(",")).to.equal("Whirlwind");
		});

		it("scales the charge between the minimum and the maximum", () => {
			const controller = new MovesetController(kit(), createCharacter());
			let chargingAction: string | undefined;
			controller.chargeStarted.connect((action) => {
				chargingAction = action;
			});

			controller.press("Skill3");
			expect(chargingAction).to.equal("Skill3");
			expect(controller.getCharge("Skill3")).to.equal(0);

			controller.update(0.375);
			expect(controller.getCharge("Skill3")).to.equal(0.5);

			controller.release("Skill3");
			expect(controller.getMove()?.move.name).to.equal("Piercer");
			expect(controller.getMove()?.charge).to.equal(0.5);
		});

		it("releases on its own at full charge", () => {
			const controller = new MovesetController(kit(), createCharacter());

			controller.press("Skill3");
			controller.update(0.75);

			const current = controller.getMove();
			expect(current?.charge).to.equal(1);
			expect(current?.startedAt).to.equal(0.625);
			expect(controller.release("Skill3")).never.to.be.ok();
		});

		it("falls back to the tap when released before the minimum charge", () => {
			const controller = new MovesetController(kit(), createCharacter());

			controller.press("Skill4");
			controller.update(0.125);
			controller.release("Skill4");

			expect(controller.getMove()?.move.name).to.equal("Pommel");
		});

		it("does nothing when a charge with no tap is released too early", () => {
			const controller = new MovesetController(kit(), createCharacter());

			controller.press("Skill3");
			controller.update(0.0625);

			expect(controller.release("Skill3")).never.to.be.ok();
			expect(controller.getMove()).never.to.be.ok();
		});

		it("ignores repeated presses while the button is still down", () => {
			const controller = new MovesetController(kit(), createCharacter());

			controller.press("Skill3");
			controller.update(0.25);
			controller.press("Skill3");
			controller.update(0.125);

			expect(controller.getCharge("Skill3")).to.equal(0.5);
		});
	});
};
