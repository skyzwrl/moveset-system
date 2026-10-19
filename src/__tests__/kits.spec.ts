/// <reference types="@rbxts/testez/globals" />

import { MovesetBuilder, MovesetController } from "..";
import { createCharacter, move, record } from "./fixtures";

function swordKit() {
	return new MovesetBuilder("Sword")
		.chain("M1", (chain) => chain.hit(move("Slash1")).hit(move("Slash2")).hit(move("Slash3")))
		.tap("Skill1", move("Lunge", { cooldown: 4 }))
		.tap("Skill2", move("Parry"))
		.stance("Unsheathed", (stance) =>
			stance
				.tap("Skill1", move("Iaido", { cooldown: 6 }))
				.chain("M1", (chain) => chain.hit(move("Draw Cut")).hit(move("Return Cut"))),
		)
		.build();
}

function fistKit() {
	return new MovesetBuilder("Fists")
		.chain("M1", (chain) => chain.hit(move("Jab")).hit(move("Cross")))
		.tap("Skill1", move("Rush"))
		.build();
}

export = () => {
	describe("kits and stances", () => {
		it("interrupts the current move and drops queued input when the kit changes", () => {
			const sword = swordKit();
			const controller = new MovesetController(sword, createCharacter());
			const log = record(controller);

			controller.press("Skill1");
			controller.update(0.375);
			expect(controller.press("Skill2")).to.equal("Buffered");

			controller.setKit(fistKit());
			controller.update(1);

			expect(log.join(",")).to.equal("start Lunge,end Lunge Interrupted");
			expect(controller.getKit().name).to.equal("Fists");
		});

		it("resets the combo when the kit changes", () => {
			const controller = new MovesetController(swordKit(), createCharacter());

			controller.press("M1");
			controller.confirmHit();
			controller.update(0.5);
			expect(controller.getComboIndex("M1")).to.equal(1);

			controller.setKit(fistKit());
			expect(controller.getComboIndex("M1")).to.equal(0);
			controller.press("M1");
			expect(controller.getMove()?.move.name).to.equal("Jab");
		});

		it("keeps cooldowns when swapping away and back", () => {
			const sword = swordKit();
			const controller = new MovesetController(sword, createCharacter());

			controller.press("Skill1");
			controller.setKit(fistKit());
			controller.setKit(sword);

			expect(controller.check("Skill1")).to.equal("Cooldown");
			expect(controller.getCooldownRemaining("Skill1")).to.equal(4);
		});

		it("lets a stance override bindings and falls back to the base kit", () => {
			const controller = new MovesetController(swordKit(), createCharacter());

			controller.setStance("Unsheathed");
			controller.press("Skill1");
			expect(controller.getMove()?.move.name).to.equal("Iaido");
			controller.update(0.5);

			controller.press("Skill2");
			expect(controller.getMove()?.move.name).to.equal("Parry");
			controller.update(0.5);

			controller.press("M1");
			expect(controller.getMove()?.move.name).to.equal("Draw Cut");
		});

		it("lets the running move finish when the stance changes", () => {
			const controller = new MovesetController(swordKit(), createCharacter());
			const log = record(controller);

			controller.press("Skill2");
			controller.setStance("Unsheathed");
			controller.update(0.5);

			expect(log.join(",")).to.equal("start Parry,end Parry Completed");
			expect(controller.getStance()).to.equal("Unsheathed");
		});

		it("rejects stances the kit doesn't have", () => {
			const controller = new MovesetController(swordKit(), createCharacter());

			expect(() => controller.setStance("Berserk")).to.throw('has no stance named "Berserk"');
		});

		it("ends the running move and refuses input once destroyed", () => {
			const controller = new MovesetController(swordKit(), createCharacter());
			const log = record(controller);

			controller.press("Skill2");
			controller.destroy();

			expect(log.join(",")).to.equal("start Parry,end Parry Interrupted");
			expect(() => controller.press("Skill2")).to.throw("destroyed");
		});
	});
};
