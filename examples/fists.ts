import { Move, MovesetBuilder } from "@skyzwrl/moveset-system";
import { CombatHooks } from "./hooks";

const PUNCH_SIZE = new Vector3(4, 4, 4);
const IN_FRONT = new CFrame(0, 0, -2.5);

export function fistKit(hooks: CombatHooks) {
	const punch = (name: string, damage: number, overrides: Partial<Move> = {}): Move => ({
		name,
		startup: 0.08,
		active: 0.06,
		recovery: 0.12,
		onStart: () => hooks.play(name),
		onActive: () => hooks.hitbox(PUNCH_SIZE, IN_FRONT, damage),
		...overrides,
	});

	return new MovesetBuilder("Fists")
		.chain("M1", (chain) =>
			chain
				.hit(punch("Jab", 2))
				.hit(punch("Cross", 2))
				.hit(punch("Hook", 2))
				.hit(punch("Body Blow", 2))
				.hit(punch("Haymaker", 5, { startup: 0.15, recovery: 0.3 }), punch("Hammer Fist", 5, { startup: 0.15 }))
				.window(0.45)
				.finisherCooldown(0.9)
				.resetOnWhiff(false),
		)
		.tap("Skill1", punch("Rush", 1, { active: 0.8, recovery: 0.3, cooldown: 7 }))
		.tap("Skill2", punch("Uppercut", 6, { startup: 0.12, recovery: 0.35, cooldown: 6 }))
		.hold("Skill2", punch("Rising Dragon", 9, { startup: 0.2, active: 0.3, recovery: 0.5, cooldown: 9 }), 0.3)
		.charge("Skill3", punch("Meteor Fist", 8, { startup: 0.1, recovery: 0.6, cooldown: 11 }), 0.15, 1)
		.tap("Dash", {
			name: "Step",
			startup: 0,
			active: 0.15,
			recovery: 0.05,
			cooldown: 1.5,
			onStart: () => hooks.lunge(10, 0.15),
		})
		.cancel({ into: ["Dash"], during: ["Startup", "Recovery"] })
		.cancel({ into: ["Skill1", "Skill2"], during: ["Recovery"], onHit: true })
		.build();
}
