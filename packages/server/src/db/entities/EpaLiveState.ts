import { Season } from "@ftc-scout/common";
import { BaseEntity, Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class EpaLiveState extends BaseEntity {
    @PrimaryColumn("smallint")
    season!: Season;

    @Column("jsonb")
    engineState!: Record<string, unknown>;

    // Used for incremental updates
    @Column("timestamptz", { nullable: true })
    lastMatchTime!: Date | null;

    @Column("int", { nullable: true })
    lastMatchId!: number | null;

    @Column("varchar", { nullable: true })
    lastEventCode!: string | null;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt!: Date;
}
