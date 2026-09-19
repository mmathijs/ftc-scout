import { Season } from "@ftc-scout/common";
import { BaseEntity, Check, Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

// History of every epa of each team AFTER each match
@Entity()
@Check(`"epa" <> 'NaN'`)
export class TeamEpaHistory extends BaseEntity {
    @PrimaryColumn("smallint")
    season!: Season;

    @PrimaryColumn("int")
    teamNumber!: number;

    @PrimaryColumn("int")
    matchesPlayed!: number;

    @Column()
    eventCode!: string;

    @Column("int")
    matchId!: number;

    @Column("float")
    epa!: number;

    // Saves requests to sort matches
    @Column("timestamptz", { nullable: true })
    matchTime!: Date | null;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;
}
