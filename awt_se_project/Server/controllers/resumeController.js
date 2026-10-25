const Resume = require('../Models/Resume');

exports.getResume = async (req, res) => {
  try {

    const userId = String(req.user._id);

    let resume = await Resume.findOne({ userId });

    if (!resume) {

      return res.json({
        personalInfo: {},
        education: [],
        skills: {
          technical: [],
          soft: [],
          tools: []
        },
        experience: [],
        projects: [],
        certifications: [],
        achievements: []
      });

    }

    res.json(resume);

  } catch (err) {

    console.error(err);
    res.status(500).json({
      error: err.message
    });

  }
};


exports.saveResume = async (req, res) => {

  try {

    const userId = String(req.user._id);

    const data = {
      ...req.body,
      userId,
      updatedAt: new Date()
    };

    delete data._id;
    delete data.__v;

    const resume = await Resume.findOneAndUpdate(
      { userId },
      { $set: data },
      {
        upsert: true,
        new: true
      }
    );

    res.json({
      success: true,
      resume
    });

  } catch (err) {

    console.error('Save Error:', err);

    res.status(500).json({
      error: err.message
    });

  }
};


exports.deleteResume = async (req, res) => {

  try {

    const userId = String(req.user._id);

    await Resume.findOneAndDelete({
      userId
    });

    res.json({
      success: true
    });

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }
};