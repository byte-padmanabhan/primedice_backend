import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
  },
  balance: {
    type: Number,
    default: 1.0,   // give them starting balance to play with
  },

  // provably fair fields
  serverSeed: {
    type: String,
    default: () => crypto.randomBytes(32).toString('hex'),
  },
  serverSeedHash: {
    type: String,
  },
  clientSeed: {
    type: String,
    default: () => crypto.randomBytes(16).toString('hex'),
  },
  nonce: {
    type: Number,
    default: 0,
  },

  // for refresh token
  refreshToken: {
    type: String,
    default: null,
  },
}, { timestamps: true });


// runs before every save — keep serverSeedHash in sync with serverSeed
//this is basically adding on top of the existing save method thing 
//mongoose is something similar to a class that has existing function and data within it 
userSchema.pre('save', async function () {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }

  if (this.isModified('serverSeed')) {
    this.serverSeedHash = crypto
      .createHash('sha256')
      .update(this.serverSeed)
      .digest('hex');
  }
});

// instance method — compare password on login
//adding extra features or methods to my schema 
userSchema.methods.isPasswordCorrect = async function (plainPassword) {
  return bcrypt.compare(plainPassword, this.password);
};

const User = mongoose.model('User', userSchema);
export default User;