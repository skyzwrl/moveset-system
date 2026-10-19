/// <reference types="@rbxts/testez/globals" />

import { MovesetBuilder, MovesetController } from "..";
import { createCharacter, move } from "./fixtures";

export = () => {
	describe("requirements and cooldowns", () => {
		it("blocks a move until its cooldown is over", () => {
			const kit = new MovesetBuilder("Fists").tap("Skill1", move("Rush", { cooldown: 1 })).build();
			const controller = new MovesetController(kit, createCharacter());
			const cooldowns = new Array<string>();
			controller.cooldownStarted.connect((action, duration) => cooldowns.push(`${action} ${duration}`));

			controller.press("Skill1");
			controller.update(0.5);
			expect(controller.check("Skill1")).to.equal("Cooldown");
			expect(controller.getCooldownRemaining("Skill1")).to.equal(0.5);

			controller.update(0.5);
			expect(controller.check("Skill1")).to.equal("Ready");
			expect(controller.getCooldownRemaining("Skill1")).to.equal(0);
			expect(cooldowns.join(",")).to.equal("Skill1 1");
		});

		it("checks grounded and airborne requirements", () => {
			const kit = new MovesetBuilder("Fists")
				.tap("Skill1", move("Sweep", { when: "Grounded" }))
				.tap("Skill2", move("Axe Kick", { when: "Airborne" }))
				.build();
			const character = createCharacter();
			const controller = new MovesetController(kit, character);

			expect(controller.check("Skill1")).to.equal("Ready");
			expect(controller.check("Skill2")).to.equal("Requirement");

			character.grounded = false;
			expect(controller.check("Skill1")).to.equal("Requirement");
			expect(controller.check("Skill2")).to.equal("Ready");
		});

		it("blocks everything while stunned except moves that allow it", () => {
			const kit = new MovesetBuilder("Fists")
				.tap("Skill1", move("Jab"))
				.tap("Block", move("Burst", { whileStunned: true }))
				.build();
			const character = createCharacter();
			const controller = new MovesetController(kit, character);

			character.stunned = true;
			expect(controller.check("Skill1")).to.equal("Stunned");
			expect(controller.check("Block")).to.equal("Ready");
		});

		it("runs custom conditions against the character", () => {
			let meter = 0;
			const kit = new MovesetBuilder("Fists")
				.tap("Ultimate", move("Awakening", { condition: () => meter >= 100 }))
				.build();
			const controller = new MovesetController(kit, createCharacter());

			expect(controller.check("Ultimate")).to.equal("Requirement");
			meter = 100;
			expect(controller.check("Ultimate")).to.equal("Ready");
		});

		it("fires a buffered press once a requirement starts passing", () => {
			const kit = new MovesetBuilder("Fists").tap("Skill1", move("Sweep", { when: "Grounded" })).build();
			const character = createCharacter();
			const controller = new MovesetController(kit, character);

			character.grounded = false;
			expect(controller.press("Skill1")).to.equal("Buffered");

			character.grounded = true;
			controller.update(0.0625);
			expect(controller.getMove()?.move.name).to.equal("Sweep");
		});

		it("reports unbound actions", () => {
			const kit = new MovesetBuilder("Fists").tap("Skill1", move("Jab")).build();
			const controller = new MovesetController(kit, createCharacter());

			expect(controller.press("Skill4")).to.equal("Unbound");
			expect(controller.check("Skill4")).to.equal("Unbound");
		});
	});
};
