import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('unresolved_questions')
export class UnresolvedQuestion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('text')
  question: string;

  @Column('boolean', { default: false })
  resolved: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
