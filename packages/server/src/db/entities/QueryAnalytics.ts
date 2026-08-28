import {
    BaseEntity,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
} from "typeorm";

@Entity()
export class QueryAnalytics extends BaseEntity {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    @Index()
    queryName!: string;

    @Column()
    @Index()
    cached!: boolean;

    @CreateDateColumn({ type: "timestamptz" })
    createdAt!: Date;
}
