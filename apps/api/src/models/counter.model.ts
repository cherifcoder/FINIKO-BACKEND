import mongoose, { Schema, model, type Model } from 'mongoose';

export interface Counter {
  _id: string;
  seq: number;
}

export const counterSchema = new Schema<Counter>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0, min: 0 },
  },
  { versionKey: false },
);

export type CounterModel = Model<Counter>;

export const CounterModel: CounterModel =
  (mongoose.models.Counter as CounterModel | undefined) ?? model<Counter>('Counter', counterSchema);

/** Incrément atomique d'un compteur nommé (ex. `driver`, `pressing`). */
export async function nextSequence(name: string): Promise<number> {
  const counter = await CounterModel.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true },
  ).lean();

  return counter?.seq ?? 1;
}
