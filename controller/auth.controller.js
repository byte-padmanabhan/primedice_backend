import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import ApiError from '../utils/ApiError.js';
import ApiResponse from '../utils/ApiResponse.js';
import asyncHandler from '../utils/asyncHandler.js';

// ── helper — generate both tokens, save refresh token to DB ──
const issueTokens = async (user) => {
  const accessToken = jwt.sign(
    { id: user._id },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { id: user._id },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: '7d' }
  );

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  return { accessToken, refreshToken };
};


// ── helper — cookie options ──
const cookieOptions = {
  httpOnly: true,   // JS cannot read this cookie
  secure: process.env.NODE_ENV === 'production',  // https only in prod
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};


// ── REGISTER ──
export const register = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  // 1. validate fields
  if (!username || !email || !password) {
    throw new ApiError(400, 'All fields are required');
  }

  // 2. check if user already exists
  const existingUser = await User.findOne({ 
    $or: [{ email }, { username }] 
  });
  if (existingUser) {
    throw new ApiError(409, 'Username or email already taken');
  }

  // 3. create user — pre save hook hashes password + generates serverSeedHash
  const user = await User.create({ username, email, password });

  // 4. generate tokens
  const { accessToken, refreshToken } = await issueTokens(user);

  // 5. send response — never send password or serverSeed
  //server seed created at the mongodb itself 
  return res
    .status(201)
    .cookie('refreshToken', refreshToken, cookieOptions)
    .json(new ApiResponse(201, {
      accessToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        balance: user.balance,
        serverSeedHash: user.serverSeedHash,
        clientSeed: user.clientSeed,
        nonce: user.nonce,
      }
    }, 'Registered successfully'));
});


// ── LOGIN ──
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // 1. validate
  if (!email || !password) {
    throw new ApiError(400, 'Email and password are required');
  }

  // 2. find user
  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  // 3. check password using instance method we defined on model
  const isMatch = await user.isPasswordCorrect(password);
  if (!isMatch) {
    throw new ApiError(401, 'Invalid credentials');
  }

  // 4. generate tokens
  const { accessToken, refreshToken } = await issueTokens(user);

  // 5. send response
  return res
    .status(200)
    .cookie('refreshToken', refreshToken, cookieOptions)
    .json(new ApiResponse(200, {
      accessToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        balance: user.balance,
        serverSeedHash: user.serverSeedHash,
        clientSeed: user.clientSeed,
        nonce: user.nonce,
      }
    }, 'Logged in successfully'));
});


// ── GET ME ──
export const getMe = asyncHandler(async (req, res) => {
  // req.user.id comes from authenticate middleware
  const user = await User.findById(req.user.id).select('-password -serverSeed -refreshToken');

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  return res.json(new ApiResponse(200, user, 'User fetched'));
});


// ── REFRESH TOKEN ──
export const refreshToken = asyncHandler(async (req, res) => {
  // refresh token comes from cookie automatically
  const incomingRefreshToken = req.cookies?.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, 'No refresh token');
  }

  // verify it
  let decoded;
  try {
    decoded = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
  } catch {
    throw new ApiError(401, 'Refresh token expired or invalid');
  }

  // check it matches what's in DB — prevents reuse of old refresh tokens
  const user = await User.findById(decoded.id);
  if (!user || user.refreshToken !== incomingRefreshToken) {
    throw new ApiError(401, 'Refresh token mismatch');
  }

  // issue new tokens
  const { accessToken, refreshToken: newRefreshToken } = await issueTokens(user);

  return res
    .status(200)
    .cookie('refreshToken', newRefreshToken, cookieOptions)
    .json(new ApiResponse(200, { accessToken }, 'Token refreshed'));
});


// ── LOGOUT ──
export const logout = asyncHandler(async (req, res) => {
  // clear refresh token from DB
  await User.findByIdAndUpdate(req.user.id, { refreshToken: null });

  return res
    .status(200)
    .clearCookie('refreshToken', cookieOptions)
    .json(new ApiResponse(200, {}, 'Logged out successfully'));
});
/*

---

What's Happening in Each Step
```
Register
  → validate fields
  → check duplicate email/username
  → User.create() → pre save hook hashes password + generates serverSeedHash
  → issue access + refresh tokens
  → refreshToken saved to DB + sent as httpOnly cookie
  → accessToken sent in response body

Login
  → find user by email
  → isPasswordCorrect() compares bcrypt hash
  → issue new tokens same way

getMe
  → middleware already verified token + put user.id on req
  → just fetch from DB, strip sensitive fields

refreshToken
  → read cookie
  → verify it
  → check it matches DB (prevents old token reuse)
  → issue fresh pair

Logout
  → clear refreshToken from DB
  → clear cookie
  */