
const testTimezone = () => {
    const inputStart = "2026-02-13T18:00"; // User input (IST)
    console.log(`Input: ${inputStart} (User intends this to be IST)`);

    // Simulated Backend Logic (Current)
    const currentStart = new Date(inputStart);
    console.log(`Current Logic (UTC Server): ${currentStart.toISOString()} (Timestamp: ${currentStart.getTime()})`);

    // Expected Logic (IST aware)
    // We want 18:00 IST -> 12:30 UTC
    // 18:00 - 5:30 = 12:30
    const fixedStart = new Date(inputStart + "+05:30");
    console.log(`Fixed Logic: ${fixedStart.toISOString()} (Timestamp: ${fixedStart.getTime()})`);

    const diffMinutes = (currentStart.getTime() - fixedStart.getTime()) / 1000 / 60;
    console.log(`Difference: ${diffMinutes} minutes (Should be 330 for 5.5 hours)`);
};

testTimezone();
