import { Season } from "@ftc-scout/common";
import {
    BaseEntity,
    Check,
    Column,
    CreateDateColumn,
    Entity,
    PrimaryColumn,
    UpdateDateColumn,
} from "typeorm";

@Entity()
@Check(`"epa" <> 'NaN'`)
export class TeamEpaCategory extends BaseEntity {
    @PrimaryColumn("smallint")
    season!: Season;

    @PrimaryColumn("int")
    teamNumber!: number;

    @PrimaryColumn("varchar")
    category!: string;

    @Column("float")
    epa!: number;

    @Column("int")
    matchesPlayed!: number;

    @Column("float")
    seasonMean!: number;

    @Column("float")
    seasonSd!: number;

    @Column("float", { nullable: true })
    fitA!: number | null;

    @Column("float", { nullable: true })
    fitB!: number | null;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt!: Date;
}
