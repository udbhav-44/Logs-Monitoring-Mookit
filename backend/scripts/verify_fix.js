
const verifyFix = () => {
    // Current Logic Implementation in analyticsController.js
    const getTimeRangeSQL = (params = {}, defaultHours = 8760) => {
        if (params.start && params.end) {
            // Force IST interpretation if no timezone provided
            const startStr = params.start.includes('+') || params.start.includes('Z') ? params.start : `${params.start}+05:30`;
            const endStr = params.end.includes('+') || params.end.includes('Z') ? params.end : `${params.end}+05:30`;

            const startDate = new Date(startStr);
            const endDate = new Date(endStr);
            return {
                start: startDate.toISOString(),
                end: endDate.toISOString(),
                sql: `timestamp >= toDateTime(${Math.floor(startDate.getTime() / 1000)}) AND timestamp <= toDateTime(${Math.floor(endDate.getTime() / 1000)})`
            };
        }
    };

    const inputStart = "2026-02-13T18:00";
    const inputEnd = "2026-02-13T20:00";
    console.log(`Input: ${inputStart} to ${inputEnd} (User IST)`);

    const result = getTimeRangeSQL({ start: inputStart, end: inputEnd });
    console.log(`Processed Start (UTC): ${result.start}`);
    console.log(`Processed End (UTC): ${result.end}`);

    // Verification Logic
    // 18:00 IST -> 12:30 UTC
    // 20:00 IST -> 14:30 UTC
    const expectedStart = "2026-02-13T12:30:00.000Z";
    const expectedEnd = "2026-02-13T14:30:00.000Z";

    if (result.start === expectedStart && result.end === expectedEnd) {
        console.log("SUCCESS: Timezone offset applied correctly.");
    } else {
        console.error("FAILURE: Timezone offset mismatch.");
        console.error(`Expected Start: ${expectedStart}, Got: ${result.start}`);
        console.error(`Expected End: ${expectedEnd}, Got: ${result.end}`);
        process.exit(1);
    }
};

verifyFix();
