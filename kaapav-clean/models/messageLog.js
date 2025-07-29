import mongoose from 'mongoose';

const messageLogSchema = new mongoose.Schema({
  from: String,
  text: String,
  timestamp: { type: Date, default: Date.now }
});

export default mongoose.model('MessageLog', messageLogSchema);
