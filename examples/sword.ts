import { Move, MovesetBuilder } from "@skyzwrl/moveset-system";
import { CombatHooks } from "./hooks";

const SLASH_SIZE = new Vector3(5, 5, 6);
const IN_FRONT = new CFrame(0, 0, -3.5);

export function swordKit(hooks: CombatHooks) {
	const slash = (name: string, animation: string, damage: number, overrides: Partial<Move> = {}): Move => ({
		name,
		startup: 0.12,
		active: 0.08,
		recovery: 0.2,
		onStart: () => hooks.play(animation),
		onActive: () => hooks.hitbox(SLASH_SIZE, IN_FRONT, damage),
		...overrides,
	});

	return new MovesetBuilder("Sword")
		.chain("M1", (chain) =>
			chain
				.hit(slash("Slash 1", "Slash1", 3))
				.hit(slash("Slash 2", "Slash2", 3))
				.hit(slash("Slash 3", "Slash3", 3), slash("Air Slash", "AirSlash", 3))
				.hit(
					slash("Launcher", "Launcher", 5, { recovery: 0.35 }),
					slash("Downslam", "Downslam", 6, { startup: 0.18, recovery: 0.4 }),
				)
				.window(0.6)
				.finisherCooldown(1.2),
		)
		.tap(
			"Skill1",
			slash("Lunge", "Lunge", 8, {
				startup: 0.2,
				active: 0.25,
				recovery: 0.45,
				cooldown: 8,
				onStart: () => {
					hooks.play("Lunge");
					hooks.lunge(18, 0.25);
				},
				cancels: [{ into: ["Dash"], during: ["Recovery"], onHit: true }],
			}),
		)
		.tap("Skill2", {
			name: "Parry",
			startup: 0.05,
			active: 0.3,
			recovery: 0.4,
			cooldown: 4,
			onStart: () => hooks.play("Parry"),
			onActive: () => hooks.parry(0.3),
		})
		.hold("Skill3", slash("Whirlwind", "Whirlwind", 4, { active: 0.6, recovery: 0.5, cooldown: 10 }), 0.35)
		.charge(
			"Skill4",
			slash("Piercer", "Piercer", 0, {
				startup: 0.15,
				active: 0.2,
				recovery: 0.6,
				cooldown: 12,
				onActive: (context) =>
					hooks.hitbox(new Vector3(4, 4, 14), new CFrame(0, 0, -7), 10 + 20 * context.charge),
			}),
			0.2,
			1.4,
		)
		.tap(
			"Ultimate",
			slash("Thousand Cuts", "Ultimate", 30, {
				startup: 0.6,
				active: 1.2,
				recovery: 0.8,
				whileStunned: true,
				condition: () => hooks.meter() >= 100,
			}),
		)
		.tap("Dash", {
			name: "Dash",
			startup: 0,
			active: 0.2,
			recovery: 0.1,
			cooldown: 2.5,
			onStart: () => hooks.lunge(14, 0.2),
		})
		.cancel({ into: ["Dash"], during: ["Startup"] })
		.stance("Unsheathed", (stance) =>
			stance.tap(
				"Skill1",
				slash("Iaido", "Iaido", 14, { startup: 0.35, active: 0.1, recovery: 0.5, cooldown: 10 }),
			),
		)
		.build();
}
