import { Season } from "@ftc-scout/common";
import {
    BaseEntity,
    Column,
    CreateDateColumn,
    DeepPartial,
    Entity,
    ManyToOne,
    PrimaryColumn,
    UpdateDateColumn,
} from "typeorm";
import { Event } from "./Event";
import { AllianceApi } from "../../ftc-api/get-alliances";

@Entity()
export class AllianceSelection extends BaseEntity {
    @PrimaryColumn("smallint")
    season!: Season;

    @PrimaryColumn()
    eventCode!: string;

    @PrimaryColumn("int")
    number!: number;

    @ManyToOne(() => Event)
    event!: Event;

    @Column("varchar", { nullable: true })
    name!: string | null;

    @Column("int", { nullable: true })
    captainTeamNumber!: number | null;

    @Column("int", { nullable: true })
    round1TeamNumber!: number | null;

    @Column("int", { nullable: true })
    round2TeamNumber!: number | null;

    @Column("int", { nullable: true })
    round3TeamNumber!: number | null;

    @Column("int", { nullable: true })
    backupTeamNumber!: number | null;

    @Column("int", { nullable: true })
    backupReplacedTeamNumber!: number | null;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt!: Date;

    static fromApi(api: AllianceApi, season: Season, eventCode: string): AllianceSelection {
        return AllianceSelection.create({
            season,
            eventCode,
            number: api.number,
            name: api.name ?? null,
            captainTeamNumber: api.captain?.teamNumber ?? null,
            round1TeamNumber: api.round1?.teamNumber ?? null,
            round2TeamNumber: api.round2?.teamNumber ?? null,
            round3TeamNumber: api.round3?.teamNumber ?? null,
            backupTeamNumber: api.backup?.teamNumber ?? null,
            backupReplacedTeamNumber: api.backupReplaced?.teamNumber ?? null,
        } satisfies DeepPartial<AllianceSelection>);
    }
}
