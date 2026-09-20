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

// A team's OPR as of their most recently completed event this season (see load-team-epas.ts's
// computeOprPredictions, which already tracks this carry-forward value for backtesting - this
// just persists its final state per team so it can be ranked/paginated like TeamEpa).
@Entity()
@Check(`"opr" <> 'NaN'`)
export class TeamOpr extends BaseEntity {
    @PrimaryColumn("smallint")
    season!: Season;

    @PrimaryColumn("int")
    teamNumber!: number;

    @Column("float")
    opr!: number;

    @Column("int")
    matchesPlayed!: number;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt!: Date;
}
