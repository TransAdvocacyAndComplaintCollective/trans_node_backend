module.exports.validateUUID = (req, res, next) => {
    const { uuid } = req.params;
    const uuidV4Pattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
  
    if (!uuidV4Pattern.test(uuid)) {
      return res.status(400).json({ error: "Invalid UUID format." });
    }
  
    next();
  };
  