import { Season } from "@ftc-scout/common";
import {
    BaseEntity,
    Column,
    CreateDateColumn,
    DeepPartial,
    Entity,
    Index,
    PrimaryGeneratedColumn,
} from "typeorm";

@Entity()
@Index(["teamNumber", "uuid"], { unique: true })
export class TeamAvatar extends BaseEntity {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column("int")
    @Index()
    teamNumber!: number;

    @Column("smallint")
    season!: Season;

    @Column()
    uuid!: string;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;

    get url(): string {
        return TeamAvatar.urlFor(this.season, this.teamNumber, this.uuid);
    }

    // needed for url getter
    toJSON() {
        return {
            id: this.id,
            teamNumber: this.teamNumber,
            season: this.season,
            uuid: this.uuid,
            url: this.url,
            createdAt: this.createdAt,
        };
    }

    static urlFor(season: Season, teamNumber: number, uuid: string): string {
        return `https://event-portal.firstinspires.org/ftc/${season}/avatars/composed/${teamNumber}_${uuid}`;
    }

    static fromParsed(season: Season, teamNumber: number, uuid: string): TeamAvatar {
        return TeamAvatar.create({ season, teamNumber, uuid } satisfies DeepPartial<TeamAvatar>);
    }
}
