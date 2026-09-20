import { Season } from "@ftc-scout/common";
import { BaseEntity, Column, Entity, PrimaryColumn } from "typeorm";

export const PredictionLevel = {
    Quals: "Quals",
    Playoff: "Playoff",
} as const;
export type PredictionLevel = (typeof PredictionLevel)[keyof typeof PredictionLevel];

// A team's win/loss ratio (wins / (wins + losses), ties counting as half of each) up to that
// point is the simplest possible baseline - no OPR-style regression, no EPA-style k-factor
// tuning, just their record so far.
export const PredictionSource = {
    Epa: "Epa",
    Opr: "Opr",
    WinLoss: "WinLoss",
} as const;
export type PredictionSource = (typeof PredictionSource)[keyof typeof PredictionSource];

// Daily win-prediction stats, sliced by level and by which team-strength model produced the
// prediction, so /epa can compare EPA against OPR and a plain win/loss record. Ties are excluded
// from classifiableCount/correctCount - there's no "correct" winner call to make on a tie - but
// do count toward eligibleCount, which backs the score-error metrics (those grade the predicted
// margin, not a winner) - WinLoss doesn't predict a score at all, so its rows leave those at 0.
@Entity()
export class PredictionStat extends BaseEntity {
    @PrimaryColumn("smallint")
    season!: Season;

    @PrimaryColumn("date")
    date!: string;

    @PrimaryColumn("varchar")
    level!: PredictionLevel;

    @PrimaryColumn("varchar")
    source!: PredictionSource;

    @Column("int")
    eligibleCount!: number;

    @Column("int")
    classifiableCount!: number;

    @Column("int")
    correctCount!: number;

    @Column("float")
    brierSum!: number;

    @Column("float")
    logLossSum!: number;

    @Column("float")
    absErrSum!: number;

    @Column("float")
    sqErrSum!: number;
}
