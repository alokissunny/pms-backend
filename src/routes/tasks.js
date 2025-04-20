// routes/tasks.js
const express = require('express');
const router = express.Router();
const Task = require('../models/Task');
const Room = require('../models/Room');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// @route   GET /api/tasks
// @desc    Get all tasks with filtering
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const {
      status,
      taskType,
      priority,
      assignedTo,
      room,
      startDate,
      endDate
    } = req.query;
    
    // Build query object
    const query = {};
    
    if (status) query.status = status;
    if (taskType) query.taskType = taskType;
    if (priority) query.priority = priority;
    if (assignedTo) query.assignedTo = assignedTo;
    if (room) query.room = room;
    
    // Date range query
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else if (startDate) {
      query.createdAt = { $gte: new Date(startDate) };
    } else if (endDate) {
      query.createdAt = { $lte: new Date(endDate) };
    }
    
    // If user is housekeeper, only show tasks assigned to them
    if (req.user.role === 'housekeeper') {
      query.assignedTo = req.user._id;
    }
    
    // Execute query with pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const startIndex = (page - 1) * limit;
    
    const tasks = await Task.find(query)
      .populate('room', 'roomNumber floor')
      .populate('assignedTo', 'firstName lastName')
      .populate('createdBy', 'firstName lastName')
      .sort({ priority: -1, createdAt: -1 })
      .skip(startIndex)
      .limit(limit);
    
    const total = await Task.countDocuments(query);
    
    res.status(200).json({
      success: true,
      count: tasks.length,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      },
      data: tasks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// @route   GET /api/tasks/:id
// @desc    Get single task
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('room', 'roomNumber floor')
      .populate('assignedTo', 'firstName lastName')
      .populate('createdBy', 'firstName lastName');
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }
    
    // Check if user has access to this task
    if (req.user.role === 'housekeeper' && task.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to access this task'
      });
    }
    
    res.status(200).json({
      success: true,
      data: task
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// @route   POST /api/tasks
// @desc    Create new task
// @access  Private (admin, manager, receptionist)
router.post('/', protect, authorize('admin', 'manager', 'receptionist'), async (req, res) => {
  try {
    // Check if assigned user exists and is a housekeeper if assigned
    if (req.body.assignedTo) {
      const assignedUser = await User.findById(req.body.assignedTo);
      
      if (!assignedUser) {
        return res.status(400).json({
          success: false,
          error: 'Assigned user not found'
        });
      }
      
      // For housekeeping tasks, make sure assigned user is a housekeeper
      if (req.body.taskType === 'cleaning' && assignedUser.role !== 'housekeeper') {
        return res.status(400).json({
          success: false,
          error: 'Cleaning tasks must be assigned to housekeepers'
        });
      }
    }
    
    // Check if room exists if specified
    if (req.body.room) {
      const roomExists = await Room.findById(req.body.room);
      
      if (!roomExists) {
        return res.status(400).json({
          success: false,
          error: 'Room not found'
        });
      }
    }
    
    // Create task
    const task = await Task.create({
      ...req.body,
      createdBy: req.user._id
    });
    
    // Populate for response
    const populatedTask = await Task.findById(task._id)
      .populate('room', 'roomNumber floor')
      .populate('assignedTo', 'firstName lastName')
      .populate('createdBy', 'firstName lastName');
    
    res.status(201).json({
      success: true,
      data: populatedTask
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// @route   PUT /api/tasks/:id
// @desc    Update task
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }
    
    // Check authorization
    if (req.user.role === 'housekeeper') {
      // Housekeepers can only update their own tasks and only the status
      if (task.assignedTo.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to update this task'
        });
      }
      
      // Allow only status updates
      const allowedFields = ['status', 'notes'];
      const requestedUpdates = Object.keys(req.body);
      
      const isValidOperation = requestedUpdates.every(update => allowedFields.includes(update));
      
      if (!isValidOperation) {
        return res.status(400).json({
          success: false,
          error: 'Housekeepers can only update status and notes'
        });
      }
    }
    
    // Check if status is being updated to completed
    if (req.body.status === 'completed' && task.status !== 'completed') {
      req.body.completedAt = Date.now();
      
      // If this is a cleaning task and has a room, update the room's lastCleaned date
      if (task.taskType === 'cleaning' && task.room) {
        await Room.findByIdAndUpdate(task.room, {
          lastCleaned: Date.now(),
          status: 'available',
          updatedAt: Date.now()
        });
      }
    }
    
    // Update task
    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: Date.now() },
      { new: true, runValidators: true }
    )
    .populate('room', 'roomNumber floor')
    .populate('assignedTo', 'firstName lastName')
    .populate('createdBy', 'firstName lastName');
    
    res.status(200).json({
      success: true,
      data: updatedTask
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// @route   DELETE /api/tasks/:id
// @desc    Delete task
// @access  Private (admin & manager only)
router.delete('/:id', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }
    
    await task.remove();
    
    res.status(200).json({
      success: true,
      data: {}
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// @route   GET /api/tasks/room/:roomId
// @desc    Get tasks for a specific room
// @access  Private
router.get('/room/:roomId', protect, async (req, res) => {
  try {
    const { status } = req.query;
    
    // Build query
    const query = { room: req.params.roomId };
    
    if (status) query.status = status;
    
    // If user is housekeeper, only show tasks assigned to them
    if (req.user.role === 'housekeeper') {
      query.assignedTo = req.user._id;
    }
    
    const tasks = await Task.find(query)
      .populate('assignedTo', 'firstName lastName')
      .populate('createdBy', 'firstName lastName')
      .sort({ priority: -1, createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: tasks.length,
      data: tasks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// @route   GET /api/tasks/assigned
// @desc    Get tasks assigned to the logged-in user
// @access  Private
router.get('/assigned/me', protect, async (req, res) => {
  try {
    const { status } = req.query;
    
    // Build query
    const query = { assignedTo: req.user._id };
    
    if (status) query.status = status;
    
    const tasks = await Task.find(query)
      .populate('room', 'roomNumber floor')
      .populate('createdBy', 'firstName lastName')
      .sort({ priority: -1, createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: tasks.length,
      data: tasks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// @route   POST /api/tasks/room/:roomId/clean
// @desc    Create a cleaning task for a room
// @access  Private
router.post('/room/:roomId/clean', protect, authorize('admin', 'manager', 'receptionist'), async (req, res) => {
  try {
    // Check if room exists
    const room = await Room.findById(req.params.roomId);
    
    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'Room not found'
      });
    }
    
    // Create cleaning task
    const cleaningTask = await Task.create({
      title: `Clean Room ${room.roomNumber}`,
      description: req.body.description || `Standard cleaning for room ${room.roomNumber}`,
      taskType: 'cleaning',
      room: room._id,
      priority: req.body.priority || 'medium',
      status: 'pending',
      assignedTo: req.body.assignedTo || null,
      dueDate: req.body.dueDate || null,
      createdBy: req.user._id
    });
    
    // Update room status if not already in cleaning
    if (room.status !== 'cleaning') {
      await Room.findByIdAndUpdate(room._id, {
        status: 'cleaning',
        updatedAt: Date.now()
      });
    }
    
    // Populate for response
    const populatedTask = await Task.findById(cleaningTask._id)
      .populate('room', 'roomNumber floor')
      .populate('assignedTo', 'firstName lastName')
      .populate('createdBy', 'firstName lastName');
    
    res.status(201).json({
      success: true,
      data: populatedTask
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// @route   POST /api/tasks/batch/assign
// @desc    Batch assign tasks to a user
// @access  Private (admin & manager only)
router.post('/batch/assign', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    const { taskIds, userId } = req.body;
    
    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Task IDs array is required'
      });
    }
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }
    
    // Check if user exists and is active
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    if (!user.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Cannot assign tasks to inactive user'
      });
    }
    
    // Update all tasks
    const updateResult = await Task.updateMany(
      { _id: { $in: taskIds } },
      { 
        assignedTo: userId,
        updatedAt: Date.now()
      }
    );
    
    res.status(200).json({
      success: true,
      data: {
        modifiedCount: updateResult.nModified,
        message: `${updateResult.nModified} tasks assigned to user`
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// @route   GET /api/tasks/stats
// @desc    Get task statistics
// @access  Private (admin & manager only)
router.get('/stats', protect, authorize('admin', 'manager'), async (req, res) => {
  try {
    // Get counts by status
    const statusCounts = await Task.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    // Get counts by task type
    const typeCounts = await Task.aggregate([
      { $group: { _id: '$taskType', count: { $sum: 1 } } }
    ]);
    
    // Get counts by priority
    const priorityCounts = await Task.aggregate([
      { $group: { _id: '$priority', count: { $sum: 1 } } }
    ]);
    
    // Get average completion time (for completed tasks)
    const avgCompletionTime = await Task.aggregate([
      { 
        $match: { 
          status: 'completed',
          completedAt: { $exists: true }
        }
      },
      {
        $project: {
          completionTime: { $subtract: ['$completedAt', '$createdAt'] }
        }
      },
      {
        $group: {
          _id: null,
          avgTime: { $avg: '$completionTime' }
        }
      }
    ]);
    
    // Format result
    const statusStats = {};
    statusCounts.forEach(item => {
      statusStats[item._id] = item.count;
    });
    
    const typeStats = {};
    typeCounts.forEach(item => {
      typeStats[item._id] = item.count;
    });
    
    const priorityStats = {};
    priorityCounts.forEach(item => {
      priorityStats[item._id] = item.count;
    });
    
    // Calculate average completion time in hours
    const avgTimeMs = avgCompletionTime.length > 0 ? avgCompletionTime[0].avgTime : 0;
    const avgTimeHours = avgTimeMs / (1000 * 60 * 60);
    
    res.status(200).json({
      success: true,
      data: {
        statusStats,
        typeStats,
        priorityStats,
        avgCompletionTimeHours: avgTimeHours
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;