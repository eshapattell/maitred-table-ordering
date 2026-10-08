// User.js: Mongoose model for staff and owner authentication in maitred
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    // Full name of the user (e.g. restaurant owner or kitchen staff)
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    // Login email: stored in lowercase, trimmed, and must be unique
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    // Securely hashed password (never stored in plain text)
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
    },
    // Access role: 'owner' can manage menu/tables, 'kitchen' handles order tickets
    role: {
      type: String,
      required: [true, 'Role is required'],
      enum: {
        values: ['owner', 'kitchen'],
        message: '{VALUE} is not a valid role',
      },
    },
    // Reference to the restaurant this staff member belongs to
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: [true, 'Restaurant ID is required'],
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt timestamps
  }
);

const User = mongoose.model('User', userSchema);
export default User;
