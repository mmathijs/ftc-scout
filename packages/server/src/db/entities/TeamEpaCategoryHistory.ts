import { Season } from "@ftc-scout/common";
import { BaseEntity, Check, Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

@Entity()
@Check(`"epa" <> 'NaN'`)
export class TeamEpaCategoryHistory extends BaseEntity {
    @PrimaryColumn("smallint")
    season!: Season;

    @PrimaryColumn("int")
    teamNumber!: number;

    @PrimaryColumn("varchar")
    category!: string;

    @PrimaryColumn("int")
    matchesPlayed!: number;

    @Column()
    eventCode!: string;

    @Column("int")
    matchId!: number;

    @Column("float")
    epa!: number;

    @Column("timestamptz", { nullable: true })
    matchTime!: Date | null;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;
}
