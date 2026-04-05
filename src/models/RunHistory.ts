import mongoose, { Schema, Document } from 'mongoose';

export interface IConcept {
  title: string;
  format: string;
  hook: string;
  insight: string;
  structure: string;
  whyWins: string;
}

export interface IRunHistory extends Document {
  runId: string;
  accounts: string[];
  links: string[];
  keywords: string[];
  brief: string;
  formats: string[];
  videoCount: number;
  transcriptCount: number;
  conceptCount: number;
  analysisRaw: string;
  conceptsRaw: string;
  concepts: IConcept[];
  status: 'running' | 'completed' | 'failed';
  stage: string;
  createdAt: Date;
}

const ConceptSchema: Schema = new Schema({
  title: { type: String, default: '' },
  format: { type: String, default: '' },
  hook: { type: String, default: '' },
  insight: { type: String, default: '' },
  structure: { type: String, default: '' },
  whyWins: { type: String, default: '' },
}, { _id: false });

const RunHistorySchema: Schema = new Schema({
  runId: { type: String, default: '' },
  accounts: { type: [String], default: [] },
  links: { type: [String], default: [] },
  keywords: { type: [String], default: [] },
  brief: { type: String, default: '' },
  formats: { type: [String], default: [] },
  videoCount: { type: Number, default: 0 },
  transcriptCount: { type: Number, default: 0 },
  conceptCount: { type: Number, default: 0 },
  analysisRaw: { type: String, default: '' },
  conceptsRaw: { type: String, default: '' },
  concepts: { type: [ConceptSchema], default: [] },
  status: { type: String, enum: ['running', 'completed', 'failed'], default: 'completed' },
  stage: { type: String, default: 'done' },
  createdAt: { type: Date, default: Date.now },
});

// Prevent model recompilation in Next.js HMR
export default mongoose.models.RunHistory || mongoose.model<IRunHistory>('RunHistory', RunHistorySchema);
