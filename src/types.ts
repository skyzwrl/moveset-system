export type DefaultAction = "M1" | "Skill1" | "Skill2" | "Skill3" | "Skill4" | "Ultimate" | "Dash" | "Block";

export type Phase = "Startup" | "Active" | "Recovery";

export type EndReason = "Completed" | "Cancelled" | "Interrupted";

export type BlockReason = "Busy" | "Cooldown" | "Stunned" | "Requirement";

export type PressResult = "Started" | "Buffered" | "Held" | "Unbound" | BlockReason;

export interface CharacterState {
	isGrounded(): boolean;
	isStunned(): boolean;
}

export interface CancelRule<A extends string = DefaultAction> {
	readonly into: ReadonlyArray<A>;
	readonly during: ReadonlyArray<Phase>;
	readonly onHit?: boolean;
}

export interface MoveContext<A extends string = DefaultAction> {
	readonly move: Move<A>;
	readonly action: A;
	readonly startedAt: number;
	readonly airborne: boolean;
	/** position in the chain for chain hits, undefined for everything else */
	readonly comboIndex?: number;
	/** 0 to 1 for charged moves, 0 for everything else */
	readonly charge: number;
}

export interface Move<A extends string = DefaultAction> {
	readonly name: string;
	readonly startup: number;
	readonly active: number;
	readonly recovery: number;
	readonly cooldown?: number;
	readonly when?: "Grounded" | "Airborne";
	readonly whileStunned?: boolean;
	readonly condition?: (character: CharacterState) => boolean;
	readonly cancels?: ReadonlyArray<CancelRule<A>>;
	readonly onStart?: (context: MoveContext<A>) => void;
	readonly onActive?: (context: MoveContext<A>) => void;
	readonly onRecovery?: (context: MoveContext<A>) => void;
	readonly onEnd?: (context: MoveContext<A>, reason: EndReason) => void;
}

export interface ChainHit<A extends string = DefaultAction> {
	readonly move: Move<A>;
	readonly air?: Move<A>;
}

export interface Chain<A extends string = DefaultAction> {
	readonly hits: ReadonlyArray<ChainHit<A>>;
	readonly window: number;
	readonly finisherCooldown: number;
	readonly resetOnWhiff: boolean;
}

export interface MoveBinding<A extends string = DefaultAction> {
	readonly kind: "Move";
	readonly tap?: Move<A>;
	readonly hold?: { readonly move: Move<A>; readonly after: number };
	readonly charge?: { readonly move: Move<A>; readonly min: number; readonly max: number };
}

export interface ChainBinding<A extends string = DefaultAction> {
	readonly kind: "Chain";
	readonly chain: Chain<A>;
}

export type Binding<A extends string = DefaultAction> = MoveBinding<A> | ChainBinding<A>;

export interface Kit<A extends string = DefaultAction> {
	readonly name: string;
	readonly bindings: ReadonlyMap<A, Binding<A>>;
	readonly stances: ReadonlyMap<string, ReadonlyMap<A, Binding<A>>>;
	readonly cancels: ReadonlyArray<CancelRule<A>>;
	readonly bufferWindow: number;
}
