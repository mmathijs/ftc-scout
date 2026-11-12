import { Season } from "@ftc-scout/common";
import { BaseEntity, Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

export type PitMapCellType =
    | "EMPTY"
    | "BOUNDARY"
    | "PIT"
    | "HORIZONTAL_FIELD"
    | "VERTICAL_FIELD"
    | "OBJECT"
    | "LABEL";

export interface PitMapElement {
    type?: PitMapCellType;
    x: number;
    y: number;
    width: number;
    height: number;
    label?: string | null;
    labelOrientation?: "HORIZONTAL" | "VERTICAL" | null;
    index?: number | null;
    team?: { number: string; name: string | null; displayNumber: string | null } | null;
    address?: string | null;
    addressGroup?: string | null;
    color?: string | null;
}

// Same shape as ApiV3PitMap from the v3 FTC API.
export interface PitMapData {
    minX: number;
    minY: number;
    width: number;
    height: number;
    showPitNumbers: boolean;
    showPitAddresses: boolean;
    elements: PitMapElement[];
}

const CELL_TYPES = new Set<string>([
    "EMPTY",
    "BOUNDARY",
    "PIT",
    "HORIZONTAL_FIELD",
    "VERTICAL_FIELD",
    "OBJECT",
    "LABEL",
]);

@Entity()
export class EventPitMap extends BaseEntity {
    @PrimaryColumn("smallint")
    season!: Season;

    @PrimaryColumn()
    eventCode!: string;

    @Column("json")
    data!: PitMapData;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt!: Date;

    static parse(raw: unknown): PitMapData {
        if (!raw || typeof raw != "object") throw new Error("pit map must be an object");
        let o = raw as Record<string, any>;
        let pick = (obj: Record<string, any>, camel: string, snake: string) =>
            obj[camel] !== undefined ? obj[camel] : obj[snake];
        let num = (v: unknown, what: string) => {
            if (typeof v != "number" || !Number.isFinite(v))
                throw new Error(`${what} must be a number`);
            return v;
        };
        let str = (v: unknown) => (v == null ? null : String(v));

        if (!Array.isArray(o.elements)) throw new Error("pit map has no elements array");
        let elements: PitMapElement[] = o.elements.map((e: any, i: number) => {
            if (!e || typeof e != "object") throw new Error(`element ${i} must be an object`);
            let type = e.type == null ? "EMPTY" : String(e.type).toUpperCase();
            if (!CELL_TYPES.has(type)) throw new Error(`element ${i}: unknown type ${e.type}`);
            let team = e.team
                ? {
                      number: String(e.team.number),
                      name: str(e.team.name),
                      displayNumber: str(pick(e.team, "displayNumber", "display_number")),
                  }
                : null;
            let orientation = str(pick(e, "labelOrientation", "label_orientation"));
            return {
                type: type as PitMapCellType,
                x: num(e.x, `element ${i}.x`),
                y: num(e.y, `element ${i}.y`),
                width: num(e.width, `element ${i}.width`),
                height: num(e.height, `element ${i}.height`),
                label: str(e.label),
                labelOrientation:
                    orientation == "VERTICAL" ? "VERTICAL" : orientation ? "HORIZONTAL" : null,
                index: typeof e.index == "number" ? e.index : null,
                team,
                address: str(e.address),
                addressGroup: str(pick(e, "addressGroup", "address_group")),
                color: str(e.color),
            };
        });

        return {
            minX: num(pick(o, "minX", "min_x") ?? 0, "minX"),
            minY: num(pick(o, "minY", "min_y") ?? 0, "minY"),
            width: num(o.width, "width"),
            height: num(o.height, "height"),
            showPitNumbers: !!(pick(o, "showPitNumbers", "show_pit_numbers") ?? true),
            showPitAddresses: !!(pick(o, "showPitAddresses", "show_pit_addresses") ?? false),
            elements,
        };
    }
}
