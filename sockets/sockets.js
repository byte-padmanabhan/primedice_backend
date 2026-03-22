// src/sockets/autobet.socket.js
import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import Bet from '../models/bet.model.js';
import crypto from 'crypto';

// reuse same helpers from bet controller
function generateRoll(serverSeed, clientSeed, nonce) {
  const hmac = crypto.createHmac('sha256', serverSeed);
  hmac.update(`${clientSeed}:${nonce}`);
  const hash = hmac.digest('hex');
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

// track active autobet loops per socket
const activeSessions = new Map();

export const autoBetSocket = (io, socket) => {

  // ── START AUTOBET ──
  socket.on('startAutobet', async (data) => {
    const { token, betAmount, mode, ranges, numberOfBets, stopOnWin, stopOnLoss } = data;

    // 1. verify JWT — sockets don't have middleware like REST
    let userId;
    try {
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      userId = decoded.id;
    } catch {
      return socket.emit('autobetError', { message: 'Invalid or expired token' });
    }

    // 2. prevent duplicate autobet sessions
    if (activeSessions.has(socket.id)) {
      return socket.emit('autobetError', { message: 'Autobet already running' });
    }

    // 3. mark this socket as active
    activeSessions.set(socket.id, true);
    socket.emit('autobetStarted', { message: 'Autobet started' });

    // 4. run the loop
    for (let i = 0; i < numberOfBets; i++) {

      // check if user stopped mid-loop
      if (!activeSessions.has(socket.id)) {
        socket.emit('autobetStopped', { message: 'Autobet stopped', betsPlaced: i });
        return;
      }

      try {
        // atomic balance deduction
        const winChance = computeWinChance(mode, ranges);
        const multiplier = 99 / winChance;

        const user = await User.findOneAndUpdate(
          { _id: userId, balance: { $gte: betAmount } },
          { $inc: { balance: -betAmount, nonce: 1 } },
          { new: false }
        );

        // insufficient balance — stop autobet
        if (!user) {
          activeSessions.delete(socket.id);
          return socket.emit('autobetStopped', {
            message: 'Insufficient balance',
            betsPlaced: i
          });
        }

        const roll = generateRoll(user.serverSeed, user.clientSeed, user.nonce);
        const outcome = didWin(roll, mode, ranges) ? 'win' : 'loss';
        const payout = outcome === 'win' ? betAmount * multiplier : 0;

        let finalBalance;
        if (outcome === 'win') {
          const updated = await User.findByIdAndUpdate(
            userId,
            { $inc: { balance: payout } },
            { new: true }
          );
          finalBalance = updated.balance;
        } else {
          const current = await User.findById(userId);
          finalBalance = current.balance;
        }

        // save to bet history
        await Bet.create({
          user: userId,
          betAmount,
          mode,
          ranges,
          clientSeed: user.clientSeed,
          serverSeedHash: user.serverSeedHash,
          nonce: user.nonce,
          roll,
          winChance,
          multiplier,
          outcome,
          payout,
          balanceAfter: finalBalance,
        });

        // emit each bet result to frontend
        socket.emit('betResult', {
          betNumber: i + 1,
          roll,
          outcome,
          payout,
          balance: finalBalance,
          nonce: user.nonce + 1,
        });

        // stop conditions
        if (stopOnWin && outcome === 'win') {
          activeSessions.delete(socket.id);
          return socket.emit('autobetStopped', {
            message: 'Stopped on win',
            betsPlaced: i + 1
          });
        }
        if (stopOnLoss && outcome === 'loss') {
          activeSessions.delete(socket.id);
          return socket.emit('autobetStopped', {
            message: 'Stopped on loss',
            betsPlaced: i + 1
          });
        }

        // small delay between bets — prevents hammering DB
        await new Promise(resolve => setTimeout(resolve, 300));

      } catch (err) {
        activeSessions.delete(socket.id);
        return socket.emit('autobetError', { message: err.message });
      }
    }

    // loop finished naturally
    activeSessions.delete(socket.id);
    socket.emit('autobetStopped', {
      message: 'Autobet completed',
      betsPlaced: numberOfBets
    });
  });

  // ── STOP AUTOBET ──
  socket.on('stopAutobet', () => {
    activeSessions.delete(socket.id);
    // the loop checks activeSessions on next iteration and stops
  });

  // ── CLEANUP ON DISCONNECT ──
  socket.on('disconnect', () => {
    activeSessions.delete(socket.id);
  });
};