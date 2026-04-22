const http = require('http');
const alertEngine = require('./alertEngine');

class VmUptimeChecker {
    constructor(registry) {
        this.registry = registry;
        this.knownAgents = new Map(); // vmId -> { vmId, hostname, ip, port }
        this.checkInterval = 60000; // 1 minute
        this.failureCounts = {}; // { vmId: count }
        this.maxFailures = 3;
        this.alertedVMs = new Set(); // To avoid spamming alerts
    }

    start() {
        console.log('✓ VM Uptime Checker started');
        setInterval(() => this.checkAllVMs(), this.checkInterval);
    }

    checkAllVMs() {
        try {
            // 1. Sync from registry to capture newly registered or updated agents
            for (const vmId in this.registry) {
                const agent = this.registry[vmId];
                if (agent.ip) {
                    this.knownAgents.set(vmId, {
                        vmId: agent.vmId,
                        hostname: agent.hostname,
                        ip: agent.ip,
                        port: agent.port
                    });
                }
            }

            // 2. Perform health check for all known agents
            for (const [vmId, vm] of this.knownAgents.entries()) {
                this.checkVM(vm);
            }
        } catch (error) {
            console.error('Error in vmUptimeChecker:', error);
        }
    }

    checkVM(vm) {
        const baseUrl = vm.ip.startsWith('http') ? vm.ip : `http://${vm.ip}`;
        const url = `${baseUrl}:${vm.port}/health`;

        const req = http.get(url, { timeout: 10000 }, (res) => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                this.markVMUp(vm);
            } else {
                this.markVMDown(vm, `HTTP Status ${res.statusCode}`);
            }
        });

        req.on('error', (err) => {
            this.markVMDown(vm, err.message);
        });

        req.on('timeout', () => {
            req.destroy();
            this.markVMDown(vm, 'Connection Timeout');
        });
    }

    markVMUp(vm) {
        if (this.failureCounts[vm.vmId] > 0) {
            console.log(`VM ${vm.vmId} uptime check passed. Resets failure count.`);
        }
        this.failureCounts[vm.vmId] = 0;
        this.alertedVMs.delete(vm.vmId);
    }

    markVMDown(vm, reason) {
        this.failureCounts[vm.vmId] = (this.failureCounts[vm.vmId] || 0) + 1;
        const currentFailures = this.failureCounts[vm.vmId];

        if (currentFailures >= this.maxFailures && !this.alertedVMs.has(vm.vmId)) {
            console.log(`VM ${vm.vmId} is DOWN (${currentFailures} consecutive failures). Reason: ${reason}`);
            this.alertedVMs.add(vm.vmId);
            
            // Trigger alert
            alertEngine.createVMDOWNAlert(vm.vmId, vm.hostname, vm.ip).catch(err => {
                console.error(`Failed to trigger VM DOWN alert for ${vm.vmId}:`, err);
            });
        }
    }

    removeVM(vmId) {
        this.knownAgents.delete(vmId);
        delete this.failureCounts[vmId];
        this.alertedVMs.delete(vmId);
    }
}

module.exports = VmUptimeChecker;
