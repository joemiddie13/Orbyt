import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Clean up expired beacons every 15 minutes
crons.interval(
	"cleanup expired beacons",
	{ minutes: 15 },
	internal.beacons.cleanupExpired
);

export default crons;
