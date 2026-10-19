import { Emitter } from "./emitter";
import {
	Binding,
	BlockReason,
	CancelRule,
	Chain,
	CharacterState,
	DefaultAction,
	EndReason,
	Kit,
	Move,
	MoveBinding,
	MoveContext,
	Phase,
	PressResult,
} from "./types";

type Trigger = "Tap" | "Hold" | "Charge" | "Chain";

interface ActiveMove<A extends string> {
	readonly context: MoveContext<A>;
	readonly chain?: Chain<A>;
	phase: Phase;
	phaseEndsAt: number;
	hit: boolean;
}

interface HeldAction {
	readonly pressedAt: number;
	fired: boolean;
}

interface BufferedPress<A extends string> {
	readonly action: A;
	readonly trigger: Trigger;
	readonly charge: number;
	readonly expiresAt: number;
}

interface ComboState<A extends string> {
	readonly action: A;
	index: number;
	expiresAt: number;
}

// zero length moves can stack several boundaries on the same instant, this only stops a broken kit
// from looping forever inside one update
const MAX_BOUNDARIES_PER_STEP = 64;

function moveFor<A extends string>(binding: MoveBinding<A>, trigger: Trigger): Move<A> | undefined {
	if (trigger === "Hold") {
		return binding.hold?.move;
	} else if (trigger === "Charge") {
		return binding.charge?.move;
	}
	return binding.tap;
}

export class MovesetController<A extends string = DefaultAction> {
	public readonly moveStarted = new Emitter<[context: MoveContext<A>]>();
	public readonly moveEnded = new Emitter<[context: MoveContext<A>, reason: EndReason]>();
	public readonly phaseChanged = new Emitter<[context: MoveContext<A>, phase: Phase]>();
	public readonly comboChanged = new Emitter<[action: A, index: number]>();
	public readonly cooldownStarted = new Emitter<[action: A, duration: number]>();
	public readonly chargeStarted = new Emitter<[action: A]>();

	private now = 0;
	private stance?: string;
	private current?: ActiveMove<A>;
	private buffered?: BufferedPress<A>;
	private destroyed = false;
	private readonly held = new Map<A, HeldAction>();
	private readonly combos = new Map<Chain<A>, ComboState<A>>();
	// keyed by the definitions themselves, so swapping to another kit and back can't refresh a cooldown
	private readonly moveReadyAt = new Map<Move<A>, number>();
	private readonly chainReadyAt = new Map<Chain<A>, number>();

	public constructor(
		private kit: Kit<A>,
		private readonly character: CharacterState,
	) {}

	public press(action: A): PressResult {
		this.assertAlive();
		const binding = this.bindingFor(action);
		if (binding === undefined) {
			return "Unbound";
		}

		if (binding.kind === "Move" && (binding.hold !== undefined || binding.charge !== undefined)) {
			if (!this.held.has(action)) {
				this.held.set(action, { pressedAt: this.now, fired: false });
				if (binding.charge !== undefined) {
					this.chargeStarted.fire(action);
				}
			}
			return "Held";
		}

		const result = this.trigger(action, binding.kind === "Chain" ? "Chain" : "Tap", 0);
		this.advanceTo(this.now);
		return result;
	}

	public release(action: A): PressResult | undefined {
		this.assertAlive();
		const held = this.held.get(action);
		if (held === undefined) {
			return undefined;
		}
		this.held.delete(action);

		const binding = this.bindingFor(action);
		if (held.fired || binding === undefined || binding.kind !== "Move") {
			return undefined;
		}

		const heldFor = this.now - held.pressedAt;
		const charge = binding.charge;
		let result: PressResult | undefined;
		if (charge !== undefined && heldFor >= charge.min) {
			result = this.trigger(action, "Charge", math.min((heldFor - charge.min) / (charge.max - charge.min), 1));
		} else if (binding.tap !== undefined) {
			result = this.trigger(action, "Tap", 0);
		}
		this.advanceTo(this.now);
		return result;
	}

	public update(deltaTime: number): void {
		this.assertAlive();
		this.advanceTo(this.now + deltaTime);
		// grounded/stunned can flip between updates without any boundary marking it
		this.tryBuffered();
	}

	/** ends the current move as Interrupted and drops the combo, buffered input and held buttons (hit stun, grabs) */
	public interrupt(): void {
		this.assertAlive();
		this.finish("Interrupted");
		this.buffered = undefined;
		this.held.clear();
		this.resetCombos();
	}

	public confirmHit(): boolean {
		const current = this.current;
		if (current === undefined) {
			return false;
		}
		current.hit = true;
		return true;
	}

	public setKit(kit: Kit<A>): void {
		this.assertAlive();
		if (kit === this.kit) {
			return;
		}
		this.interrupt();
		this.combos.clear();
		this.kit = kit;
		this.stance = undefined;
	}

	public setStance(stance: string | undefined): void {
		this.assertAlive();
		if (stance !== undefined && !this.kit.stances.has(stance)) {
			throw `Kit "${this.kit.name}" has no stance named "${stance}"`;
		}
		if (stance === this.stance) {
			return;
		}
		this.stance = stance;
		this.buffered = undefined;
		this.held.clear();
		this.resetCombos();
	}

	public check(action: A): "Ready" | "Unbound" | BlockReason {
		const binding = this.bindingFor(action);
		if (binding === undefined) {
			return "Unbound";
		}
		const move =
			binding.kind === "Chain"
				? this.hitMove(binding.chain, this.nextHitIndex(binding.chain))
				: (binding.tap ?? binding.hold?.move ?? binding.charge?.move);
		if (move === undefined) {
			return "Unbound";
		}
		return this.blockReason(action, binding, move) ?? "Ready";
	}

	public getCooldownRemaining(action: A): number {
		const binding = this.bindingFor(action);
		if (binding === undefined) {
			return 0;
		}
		let readyAt: number;
		if (binding.kind === "Chain") {
			readyAt = this.chainReadyAt.get(binding.chain) ?? 0;
		} else {
			const move = binding.tap ?? binding.hold?.move ?? binding.charge?.move;
			readyAt = move !== undefined ? (this.moveReadyAt.get(move) ?? 0) : 0;
		}
		return math.max(readyAt - this.now, 0);
	}

	public getComboIndex(action: A): number {
		const binding = this.bindingFor(action);
		if (binding === undefined || binding.kind !== "Chain") {
			return 0;
		}
		return this.combos.get(binding.chain)?.index ?? 0;
	}

	public getCharge(action: A): number | undefined {
		const held = this.held.get(action);
		const binding = this.bindingFor(action);
		if (held === undefined || held.fired || binding === undefined || binding.kind !== "Move") {
			return undefined;
		}
		const charge = binding.charge;
		if (charge === undefined) {
			return undefined;
		}
		return math.clamp((this.now - held.pressedAt - charge.min) / (charge.max - charge.min), 0, 1);
	}

	public getMove(): MoveContext<A> | undefined {
		return this.current?.context;
	}

	public getPhase(): Phase | undefined {
		return this.current?.phase;
	}

	public getKit(): Kit<A> {
		return this.kit;
	}

	public getStance(): string | undefined {
		return this.stance;
	}

	public destroy(): void {
		if (this.destroyed) {
			return;
		}
		this.finish("Interrupted");
		this.destroyed = true;
		this.buffered = undefined;
		this.held.clear();
		this.moveStarted.clear();
		this.moveEnded.clear();
		this.phaseChanged.clear();
		this.comboChanged.clear();
		this.cooldownStarted.clear();
		this.chargeStarted.clear();
	}

	// walks time forward one boundary at a time (phase ends, hold thresholds, cooldowns coming back, buffer
	// and combo expiry) so one big update behaves exactly like many small ones
	private advanceTo(target: number): void {
		for (let step = 0; step < MAX_BOUNDARIES_PER_STEP; step++) {
			const boundary = this.nextBoundary(target);
			if (boundary === undefined) {
				break;
			}
			this.now = math.max(this.now, boundary);
			this.processBoundary();
		}
		this.now = math.max(this.now, target);
	}

	private nextBoundary(target: number): number | undefined {
		let earliest = math.huge;

		const current = this.current;
		if (current !== undefined) {
			earliest = current.phaseEndsAt;
		}

		for (const [action, held] of this.held) {
			const binding = this.bindingFor(action);
			if (!held.fired && binding !== undefined && binding.kind === "Move") {
				const fireAfter = binding.hold?.after ?? binding.charge?.max;
				if (fireAfter !== undefined) {
					earliest = math.min(earliest, held.pressedAt + fireAfter);
				}
			}
		}

		const buffered = this.buffered;
		if (buffered !== undefined) {
			earliest = math.min(earliest, buffered.expiresAt);
			const readyAt = this.readyAtFor(buffered);
			if (readyAt > this.now) {
				earliest = math.min(earliest, readyAt);
			}
		}

		for (const [chain, combo] of this.combos) {
			if (combo.index !== 0 && current?.chain !== chain) {
				earliest = math.min(earliest, combo.expiresAt);
			}
		}

		return earliest <= target ? earliest : undefined;
	}

	private processBoundary(): void {
		let current = this.current;
		while (current !== undefined && current.phaseEndsAt <= this.now) {
			this.advancePhase(current);
			current = this.current;
		}

		for (const [action, held] of this.held) {
			const binding = this.bindingFor(action);
			if (held.fired || binding === undefined || binding.kind !== "Move") {
				continue;
			}
			if (binding.hold !== undefined && this.now >= held.pressedAt + binding.hold.after) {
				held.fired = true;
				this.trigger(action, "Hold", 0);
			} else if (binding.charge !== undefined && this.now >= held.pressedAt + binding.charge.max) {
				held.fired = true;
				this.trigger(action, "Charge", 1);
			}
		}

		for (const [chain, combo] of this.combos) {
			if (combo.index !== 0 && this.current?.chain !== chain && this.now >= combo.expiresAt) {
				this.setComboIndex(combo, 0);
			}
		}

		this.tryBuffered();
	}

	private advancePhase(active: ActiveMove<A>): void {
		const move = active.context.move;
		if (active.phase === "Startup") {
			active.phase = "Active";
			active.phaseEndsAt += move.active;
			move.onActive?.(active.context);
		} else if (active.phase === "Active") {
			active.phase = "Recovery";
			active.phaseEndsAt += move.recovery;
			move.onRecovery?.(active.context);
		} else {
			this.finish("Completed");
			return;
		}

		if (this.current === active) {
			this.phaseChanged.fire(active.context, active.phase);
		}
	}

	private trigger(action: A, trigger: Trigger, charge: number): PressResult {
		const result = this.attempt(action, trigger, charge);
		if (result === "Started" || result === "Unbound" || this.kit.bufferWindow <= 0) {
			return result;
		}
		this.buffered = { action, trigger, charge, expiresAt: this.now + this.kit.bufferWindow };
		return "Buffered";
	}

	private tryBuffered(): void {
		const buffered = this.buffered;
		if (buffered === undefined) {
			return;
		}
		const result = this.attempt(buffered.action, buffered.trigger, buffered.charge);
		if (
			result !== "Started" &&
			this.buffered === buffered &&
			(result === "Unbound" || this.now >= buffered.expiresAt)
		) {
			this.buffered = undefined;
		}
	}

	private attempt(action: A, trigger: Trigger, charge: number): PressResult {
		const binding = this.bindingFor(action);
		if (binding === undefined) {
			return "Unbound";
		}

		if (binding.kind === "Chain") {
			const index = this.nextHitIndex(binding.chain);
			const move = this.hitMove(binding.chain, index);
			const blocked = this.blockReason(action, binding, move);
			if (blocked !== undefined) {
				return blocked;
			}
			this.start(action, move, charge, binding.chain, index);
			return "Started";
		}

		const move = moveFor(binding, trigger);
		if (move === undefined) {
			return "Unbound";
		}
		const blocked = this.blockReason(action, binding, move);
		if (blocked !== undefined) {
			return blocked;
		}
		this.start(action, move, charge);
		return "Started";
	}

	private blockReason(action: A, binding: Binding<A>, move: Move<A>): BlockReason | undefined {
		const character = this.character;
		if (move.whileStunned !== true && character.isStunned()) {
			return "Stunned";
		}

		const grounded = character.isGrounded();
		if ((move.when === "Grounded" && !grounded) || (move.when === "Airborne" && grounded)) {
			return "Requirement";
		}
		if (move.condition !== undefined && !move.condition(character)) {
			return "Requirement";
		}

		if (this.now < (this.moveReadyAt.get(move) ?? 0)) {
			return "Cooldown";
		}
		if (binding.kind === "Chain" && this.now < (this.chainReadyAt.get(binding.chain) ?? 0)) {
			return "Cooldown";
		}

		const current = this.current;
		if (current !== undefined && !this.canCancel(current, action)) {
			return "Busy";
		}
		return undefined;
	}

	private canCancel(active: ActiveMove<A>, into: A): boolean {
		return this.allows(active.context.move.cancels, active, into) || this.allows(this.kit.cancels, active, into);
	}

	private allows(rules: ReadonlyArray<CancelRule<A>> | undefined, active: ActiveMove<A>, into: A): boolean {
		if (rules === undefined) {
			return false;
		}
		for (const rule of rules) {
			if (rule.into.includes(into) && rule.during.includes(active.phase) && (rule.onHit !== true || active.hit)) {
				return true;
			}
		}
		return false;
	}

	private start(action: A, move: Move<A>, charge: number, chain?: Chain<A>, comboIndex?: number): void {
		const previous = this.current;
		if (previous !== undefined) {
			this.finish("Cancelled");
			if (previous.chain !== undefined && previous.chain !== chain) {
				const broken = this.combos.get(previous.chain);
				if (broken !== undefined) {
					this.setComboIndex(broken, 0);
				}
			}
		}

		const context: MoveContext<A> = {
			move,
			action,
			startedAt: this.now,
			airborne: !this.character.isGrounded(),
			comboIndex,
			charge,
		};
		const active: ActiveMove<A> = {
			context,
			chain,
			phase: "Startup",
			phaseEndsAt: this.now + move.startup,
			hit: false,
		};
		this.current = active;
		this.buffered = undefined;

		if (move.cooldown !== undefined && move.cooldown > 0) {
			this.moveReadyAt.set(move, this.now + move.cooldown);
			this.cooldownStarted.fire(action, move.cooldown);
		}

		if (chain !== undefined && comboIndex !== undefined) {
			const combo = this.comboFor(chain, action);
			const finisher = comboIndex === chain.hits.size() - 1;
			this.setComboIndex(combo, finisher ? 0 : comboIndex + 1);

			if (finisher && chain.finisherCooldown > 0) {
				// counted from the start so cancelling out of the finisher can't skip the endlag
				const lockedFor = move.startup + move.active + move.recovery + chain.finisherCooldown;
				this.chainReadyAt.set(chain, this.now + lockedFor);
				this.cooldownStarted.fire(action, lockedFor);
			}
		}

		move.onStart?.(context);
		if (this.current === active) {
			this.moveStarted.fire(context);
		}
	}

	private finish(reason: EndReason): void {
		const active = this.current;
		if (active === undefined) {
			return;
		}
		this.current = undefined;

		const chain = active.chain;
		if (chain !== undefined && reason === "Completed") {
			const combo = this.comboFor(chain, active.context.action);
			combo.expiresAt = this.now + chain.window;
			if (chain.resetOnWhiff && !active.hit) {
				this.setComboIndex(combo, 0);
			}
		}

		active.context.move.onEnd?.(active.context, reason);
		this.moveEnded.fire(active.context, reason);
	}

	// expiry is a boundary of its own, so a stale index has always been reset by the time anything reads it
	private nextHitIndex(chain: Chain<A>): number {
		return this.combos.get(chain)?.index ?? 0;
	}

	private hitMove(chain: Chain<A>, index: number): Move<A> {
		const hit = chain.hits[index];
		return hit.air !== undefined && !this.character.isGrounded() ? hit.air : hit.move;
	}

	private readyAtFor(buffered: BufferedPress<A>): number {
		const binding = this.bindingFor(buffered.action);
		if (binding === undefined) {
			return 0;
		}
		if (binding.kind === "Chain") {
			const hitReadyAt = this.moveReadyAt.get(this.hitMove(binding.chain, this.nextHitIndex(binding.chain)));
			return math.max(this.chainReadyAt.get(binding.chain) ?? 0, hitReadyAt ?? 0);
		}
		const move = moveFor(binding, buffered.trigger);
		return move !== undefined ? (this.moveReadyAt.get(move) ?? 0) : 0;
	}

	private comboFor(chain: Chain<A>, action: A): ComboState<A> {
		let combo = this.combos.get(chain);
		if (combo === undefined) {
			combo = { action, index: 0, expiresAt: 0 };
			this.combos.set(chain, combo);
		}
		return combo;
	}

	private setComboIndex(combo: ComboState<A>, index: number): void {
		if (combo.index === index) {
			return;
		}
		combo.index = index;
		this.comboChanged.fire(combo.action, index);
	}

	private resetCombos(): void {
		for (const [, combo] of this.combos) {
			this.setComboIndex(combo, 0);
		}
	}

	private bindingFor(action: A): Binding<A> | undefined {
		const stance = this.stance;
		if (stance !== undefined) {
			const binding = this.kit.stances.get(stance)?.get(action);
			if (binding !== undefined) {
				return binding;
			}
		}
		return this.kit.bindings.get(action);
	}

	private assertAlive(): void {
		if (this.destroyed) {
			throw "MovesetController is destroyed";
		}
	}
}
