import mongoose from 'mongoose';

const betSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  betAmount: {
    type: Number,
    required: true,
  },
  mode: {
    type: Number,  // 0 = between, 1 = outside, 2 = two ranges
    required: true,
  },
  ranges: {
    type: [Number],  // [lo, hi] or [lo1, hi1, lo2, hi2]
    required: true,
  },
  clientSeed: {
    type: String,
    required: true,
  },
  serverSeedHash: {
    type: String,
    required: true,
  },
  nonce: {
    type: Number,
    required: true,
  },
  roll: {
    type: Number,   // the actual result e.g. 47.32
    required: true,
  },
  winChance: {
    type: Number,   // e.g. 50.00
    required: true,
  },
  multiplier: {
    type: Number,   // e.g. 1.98
    required: true,
  },
  outcome: {
    type: String,
    enum: ['win', 'loss'],
    required: true,
  },
  payout: {
    type: Number,   // 0 if loss, betAmount * multiplier if win
    required: true,
  },
  balanceAfter: {
    type: Number,   // user balance after this bet
    required: true,
  },
}, { timestamps: true });

const Bet = mongoose.model('Bet', betSchema);
export default Bet;