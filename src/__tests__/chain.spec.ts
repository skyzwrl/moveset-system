/// <reference types="@rbxts/testez/globals" />

import { MovesetBuilder, MovesetController } from "..";
import { createCharacter, move, record, started } from "./fixtures";

function swordKit(resetOnWhiff = true) {
	return new MovesetBuilder("Sword")
		.chain("M1", (chain) =>
			chain
				.hit(move("Slash1"))
				.hit(move("Slash2"))
				.hit(move("Slash3"), move("AirSlash"))
				.hit(move("Finisher"), move("Downslam"))
				.window(0.5)
				.finisherCooldown(1)
				.resetOnWhiff(resetOnWhiff),
		)
		.tap("Dash", move("Dash", { startup: 0, active: 0.125, recovery: 0 }))
		.cancel({ into: ["Dash"], during: ["Startup", "Active", "Recovery"] })
		.build();
}

export = () => {
	// declared in here so it picks up TestEZ's expect, which only exists in the spec function's environment
	const landHit = (controller: MovesetController) => {
		expect(controller.press("M1")).to.equal("Started");
		controller.confirmHit();
		controller.update(0.5);
	};

	describe("m1 chains", () => {
		it("plays the hits in order and starts over after the finisher", () => {
			const controller = new MovesetController(swordKit(), createCharacter());
			const names = started(controller);

			for (let index = 0; index < 4; index++) {
				landHit(controller);
			}
			expect(names.join(",")).to.equal("Slash1,Slash2,Slash3,Finisher");

			controller.update(1);
			controller.press("M1");
			expect(names[4]).to.equal("Slash1");
		});

		it("gives each hit its index in the string", () => {
			const controller = new MovesetController(swordKit(), createCharacter());
			const indices = new Array<number>();
			controller.moveStarted.connect((context) => indices.push(context.comboIndex ?? -1));

			for (let index = 0; index < 4; index++) {
				landHit(controller);
			}

			expect(indices.join(",")).to.equal("0,1,2,3");
		});

		it("continues inside the window and resets once it runs out", () => {
			const controller = new MovesetController(swordKit(), createCharacter());
			const log = record(controller);

			landHit(controller);
			controller.update(0.25);
			landHit(controller);
			expect(controller.getComboIndex("M1")).to.equal(2);

			controller.update(0.5);
			expect(controller.getComboIndex("M1")).to.equal(0);
			expect(log[log.size() - 1]).to.equal("combo M1 0");

			controller.press("M1");
			expect(controller.getMove()?.move.name).to.equal("Slash1");
		});

		it("resets on a whiff", () => {
			const controller = new MovesetController(swordKit(), createCharacter());
			const names = started(controller);

			controller.press("M1");
			controller.update(0.5);
			controller.press("M1");

			expect(names.join(",")).to.equal("Slash1,Slash1");
		});

		it("keeps going after a whiff when the chain allows it", () => {
			const controller = new MovesetController(swordKit(false), createCharacter());
			const names = started(controller);

			controller.press("M1");
			controller.update(0.5);
			controller.press("M1");

			expect(names.join(",")).to.equal("Slash1,Slash2");
		});

		it("resets when the character is interrupted mid string", () => {
			const controller = new MovesetController(swordKit(), createCharacter());
			const log = record(controller);

			landHit(controller);
			controller.press("M1");
			controller.interrupt();

			expect(log.join(",")).to.equal(
				"combo M1 1,start Slash1,end Slash1 Completed,combo M1 2,start Slash2,end Slash2 Interrupted,combo M1 0",
			);
			controller.press("M1");
			expect(controller.getMove()?.move.name).to.equal("Slash1");
		});

		it("uses air variants while airborne", () => {
			const character = createCharacter();
			const controller = new MovesetController(swordKit(), character);
			const names = started(controller);

			character.grounded = false;
			for (let index = 0; index < 4; index++) {
				landHit(controller);
			}

			expect(names.join(",")).to.equal("Slash1,Slash2,AirSlash,Downslam");
		});

		it("locks m1 for the finisher plus its cooldown, even when the finisher is cancelled", () => {
			const controller = new MovesetController(swordKit(), createCharacter());

			for (let index = 0; index < 3; index++) {
				landHit(controller);
			}
			controller.press("M1");
			expect(controller.getMove()?.move.name).to.equal("Finisher");

			controller.press("Dash");
			controller.update(0.125);
			expect(controller.getMove()).never.to.be.ok();
			expect(controller.check("M1")).to.equal("Cooldown");
			expect(controller.getCooldownRemaining("M1")).to.equal(1.375);

			controller.update(1.375);
			expect(controller.check("M1")).to.equal("Ready");
		});

		it("breaks the string when a hit is cancelled into another action", () => {
			const controller = new MovesetController(swordKit(), createCharacter());
			const names = started(controller);

			landHit(controller);
			controller.press("M1");
			controller.confirmHit();
			controller.press("Dash");
			controller.update(0.125);
			controller.press("M1");

			expect(names.join(",")).to.equal("Slash1,Slash2,Dash,Slash1");
		});
	});
};
