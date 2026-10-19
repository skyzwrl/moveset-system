/// <reference types="@rbxts/testez/globals" />

import { MovesetBuilder } from "..";
import { move } from "./fixtures";

export = () => {
	describe("MovesetBuilder", () => {
		it("rejects two different moves with the same name", () => {
			const builder = new MovesetBuilder("Sword").tap("Skill1", move("Slash")).tap("Skill2", move("Slash"));

			expect(() => builder.build()).to.throw('Kit "Sword": two different moves are named "Slash"');
		});

		it("allows the same move to be bound more than once", () => {
			const slash = move("Slash");
			const kit = new MovesetBuilder("Sword")
				.tap("Skill1", slash)
				.stance("Unsheathed", (stance) => stance.tap("Skill1", slash))
				.build();

			expect(kit.stances.has("Unsheathed")).to.equal(true);
		});

		it("rejects negative and non finite timings", () => {
			expect(() => new MovesetBuilder("Sword").tap("Skill1", move("Slash", { startup: -0.1 })).build()).to.throw(
				'"Slash" startup must be a finite number of seconds',
			);

			expect(() =>
				new MovesetBuilder("Sword").tap("Skill1", move("Slash", { cooldown: math.huge })).build(),
			).to.throw('"Slash" cooldown must be a finite number of seconds');

			expect(() =>
				new MovesetBuilder("Sword").tap("Skill1", move("Slash", { recovery: 0 / 0 })).build(),
			).to.throw('"Slash" recovery must be a finite number of seconds');
		});

		it("rejects chains without hits", () => {
			expect(() => new MovesetBuilder("Sword").chain("M1", () => {}).build()).to.throw(
				'the "M1" chain has no hits',
			);
		});

		it("rejects binding over a chain and a chain over a binding", () => {
			const chained = new MovesetBuilder("Sword").chain("M1", (chain) => chain.hit(move("Slash")));
			expect(() => chained.tap("M1", move("Stab"))).to.throw('"M1" is already bound to a chain');

			const tapped = new MovesetBuilder("Sword").tap("M1", move("Stab"));
			expect(() => tapped.chain("M1", (chain) => chain.hit(move("Slash")))).to.throw('"M1" is already bound');
		});

		it("rejects a hold and a charge on the same action", () => {
			const builder = new MovesetBuilder("Sword")
				.hold("Skill2", move("Spin"), 0.3)
				.charge("Skill2", move("Thrust"), 0.2, 1);

			expect(() => builder.build()).to.throw(`"Skill2" can't have both a hold and a charge move`);
		});

		it("checks hold thresholds and charge ranges", () => {
			expect(() => new MovesetBuilder("Sword").hold("Skill2", move("Spin"), 0).build()).to.throw(
				'"Skill2" hold threshold must be greater than 0',
			);
			expect(() => new MovesetBuilder("Sword").charge("Skill3", move("Thrust"), 1, 1).build()).to.throw(
				'"Skill3" maximum charge must be greater than its minimum',
			);
		});

		it("rejects cancel rules that can never apply", () => {
			const builder = new MovesetBuilder("Sword")
				.tap("Skill1", move("Slash"))
				.cancel({ into: [], during: ["Recovery"] });

			expect(() => builder.build()).to.throw("a cancel rule on the kit needs at least one action and one phase");
		});

		it("rejects duplicate stances", () => {
			const builder = new MovesetBuilder("Sword").stance("Unsheathed", () => {});

			expect(() => builder.stance("Unsheathed", () => {})).to.throw('Stance "Unsheathed" is already defined');
		});

		it("builds a kit that later builder calls can't change", () => {
			const builder = new MovesetBuilder("Sword").tap("Skill1", move("Slash"));
			const kit = builder.build();
			builder.tap("Skill2", move("Stab"));

			expect(kit.bindings.has("Skill2")).to.equal(false);
		});
	});
};
