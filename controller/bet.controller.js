import crypto from 'crypto';
import User from '../models/user.model.js';
import Bet from '../models/bet.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/AsyncHandler.js';

// ── helpers ──

function generateRoll(serverSeed, clientSeed, nonce) {
  const hmac = crypto.createHmac('sha256', serverSeed);
  hmac.update(`${clientSeed}:${nonce}`);
  const hash = hmac.digest('hex');

  // take first 8 hex chars → number → scale to 0.00 - 99.99
  const decimal = parseInt(hash.slice(0, 8), 16);
  return (decimal % 10000) / 100;
}

function computeWinChance(mode, ranges) {
  if (mode === 0) return ranges[1] - ranges[0];
  if (mode === 1) return ranges[0] + (100 - ranges[1]);
  if (mode === 2) return (ranges[1] - ranges[0]) + (ranges[3] - ranges[2]);
}

function didWin(roll, mode, ranges) {
  if (mode === 0) return roll >= ranges[0] && roll <= ranges[1];
  if (mode === 1) return roll <= ranges[0] || roll >= ranges[1];
  if (mode === 2) return (
    (roll >= ranges[0] && roll <= ranges[1]) ||
    (roll >= ranges[2] && roll <= ranges[3])
  );
}

// ── PLACE BET ──
export const placeBet = asyncHandler(async (req, res) => {
  const { betAmount, mode, ranges } = req.body;

  // 1. validate inputs
  if (!betAmount || betAmount <= 0) {
    throw new ApiError(400, 'Invalid bet amount');
  }
  if (![0, 1, 2].includes(mode)) {
    throw new ApiError(400, 'Invalid mode');
  }
  if (!ranges || !Array.isArray(ranges)) {
    throw new ApiError(400, 'Ranges are required');
  }
  if (mode === 2 && ranges.length !== 4) {
    throw new ApiError(400, 'Mode 2 requires 4 range values');
  }
  if ((mode === 0 || mode === 1) && ranges.length !== 2) {
    throw new ApiError(400, 'Mode 0 and 1 require 2 range values');
  }

  // 2. compute win chance server side — never trust frontend
  const winChance = computeWinChance(mode, ranges);
  if (winChance <= 0 || winChance >= 100) {
    throw new ApiError(400, 'Invalid ranges');
  }
  const multiplier = 99 / winChance;

  // 3. atomic balance deduction + nonce increment
  // findOneAndUpdate is atomic — no race condition possible
  const user = await User.findOneAndUpdate(
    {
      _id: req.user.id,
      balance: { $gte: betAmount },  // only update if balance is enough
    },
    {
      $inc: { balance: -betAmount, nonce: 1 },  // deduct bet + increment nonce
    },
    { new: false }  // return OLD document — we need the nonce BEFORE increment
  );

  // if user is null — either user not found or insufficient balance
  if (!user) {
    const currentUser = await User.findById(req.user.id);
    if (!currentUser) throw new ApiError(404, 'User not found');
    throw new ApiError(400, 'Insufficient balance');
  }

  // 4. generate roll using the nonce BEFORE it was incremented
  const roll = generateRoll(user.serverSeed, user.clientSeed, user.nonce);

  // 5. determine outcome
  const outcome = didWin(roll, mode, ranges) ? 'win' : 'loss';
  const payout = outcome === 'win' ? betAmount * multiplier : 0;

  // 6. if win — add payout to balance
  let finalBalance;
  if (outcome === 'win') {
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { $inc: { balance: payout } },
      { new: true }
    );
    finalBalance = updatedUser.balance;
  } else {
    // balance was already deducted in step 3
    // fetch current balance to return to frontend
    const currentUser = await User.findById(req.user.id);
    finalBalance = currentUser.balance;
  }

  // 7. save bet to history
  await Bet.create({
    user: req.user.id,
    betAmount,
    mode,
    ranges,
    clientSeed: user.clientSeed,
    serverSeedHash: user.serverSeedHash,
    nonce: user.nonce,   // the nonce used for this bet (before increment)
    roll,
    winChance,
    multiplier,
    outcome,
    payout,
    balanceAfter: finalBalance,
  });

  // 8. send response
  return res.json(new ApiResponse(200, {
    roll,          // e.g. 47.32 — shown on slider
    outcome,       // 'win' or 'loss'
    payout,        // 0 if loss
    balance: finalBalance,  // update wallet in UI
    nonce: user.nonce + 1,  // new nonce after this bet
    multiplier,
    winChance,
  }, outcome === 'win' ? 'You won!' : 'Better luck next time'));
});


// ── BET HISTORY ──
export const getBetHistory = asyncHandler(async (req, res) => {
  const bets = await Bet.find({ user: req.user.id })
    .sort({ createdAt: -1 })  // newest first
    .limit(20);               // last 20 bets

  return res.json(new ApiResponse(200, bets, 'Bet history fetched'));
});