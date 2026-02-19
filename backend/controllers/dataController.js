const { getClient } = require('../config/clickhouse');

const deletePartition = async (req, res) => {
    const { vmId, app, month } = req.body;

    // Basic Validation
    if (!vmId || !app || !month) {
        return res.status(400).json({ message: 'Missing required fields: vmId, app, month (YYYYMM)' });
    }

    // Validate Month Format (YYYYMM)
    if (!/^\d{6}$/.test(month)) {
        return res.status(400).json({ message: 'Invalid month format. Use YYYYMM.' });
    }

    try {
        const client = getClient();

        // Construct Partition ID (String format for ClickHouse)
        // Partition ID for (vmId, app, month) in ClickHouse is usually ('vmId', 'app', month)
        // We use query parameter binding or safe string construction
        const vmIdSafe = vmId.replace(/'/g, "\\'");
        const appSafe = app.replace(/'/g, "\\'");
        const partitionExpr = `('${vmIdSafe}', '${appSafe}', ${month})`;

        const query = `ALTER TABLE logs.logs DROP PARTITION ${partitionExpr}`;

        console.log(`[DataController] Deleting partition: ${partitionExpr}`);
        await client.query({ query });

        res.json({ message: `Successfully deleted logs for ${app} on ${vmId} for month ${month}` });

    } catch (error) {
        console.error('Error deleting partition:', error);
        res.status(500).json({ message: 'Failed to delete logs', error: error.message });
    }
};

module.exports = { deletePartition };
