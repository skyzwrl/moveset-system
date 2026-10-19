export interface CombatHooks {
	play(animation: string): void;
	hitbox(size: Vector3, offset: CFrame, damage: number): void;
	lunge(distance: number, duration: number): void;
	parry(duration: number): void;
	meter(): number;
}
