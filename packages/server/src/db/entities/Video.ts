import {
    BaseEntity,
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryColumn,
    UpdateDateColumn,
} from "typeorm";
import { Match } from "./Match";
import { Season } from "@ftc-scout/common";

export const VideoSource = {
    FTCEvents: "FTCEvents",
    ClipFarm: "ClipFarm",
} as const;
export type VideoSource = (typeof VideoSource)[keyof typeof VideoSource];

@Entity()
export class Video extends BaseEntity {
    @PrimaryColumn("smallint")
    eventSeason!: Season;

    @PrimaryColumn()
    eventCode!: string;

    @PrimaryColumn("int")
    matchId!: number;

    @PrimaryColumn("enum", { enum: VideoSource, enumName: "video_source_enum" })
    source!: VideoSource;

    @ManyToOne(() => Match, (match) => match.videos)
    @JoinColumn([
        { name: "event_season", referencedColumnName: "eventSeason" },
        { name: "event_code", referencedColumnName: "eventCode" },
        { name: "match_id", referencedColumnName: "id" },
    ])
    match!: Match;

    @Column()
    url!: string;

    @Column()
    title!: string;

    @Column()
    official!: boolean;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;

    @UpdateDateColumn({ type: "timestamptz" })
    updatedAt!: Date;
}
