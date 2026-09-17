export class TestHarness {
    private passed = 0;
    private failed = 0;
    private suiteName: string;

    constructor(suiteName: string) {
        this.suiteName = suiteName;
    }

    public async test(name: string, fn: () => Promise<void> | void): Promise<void> {
        try {
            await fn();
            this.passed++;
            console.log(`  ✅ [PASS] ${name}`);
        } catch (error: any) {
            this.failed++;
            console.error(`  ❌ [FAIL] ${name}`);
            console.error(`     Message: ${error.message}`);
            if (error.expected !== undefined && error.actual !== undefined) {
                console.error(`     Expected: ${JSON.stringify(error.expected)}`);
                console.error(`     Actual:   ${JSON.stringify(error.actual)}`);
            }
            if (error.stack) {
                console.error(`     Stack: ${error.stack.split('\n').slice(1, 4).join('\n')}`);
            }
        }
    }

    public getSummary() {
        return {
            suite: this.suiteName,
            passed: this.passed,
            failed: this.failed,
            total: this.passed + this.failed
        };
    }

    public printSummary() {
        console.log(`\n--- ${this.suiteName} Summary: ${this.passed} passed, ${this.failed} failed ---\n`);
    }
}

export function assertEqual<T>(actual: T, expected: T, message?: string) {
    if (actual !== expected) {
        const err: any = new Error(message || `Expected ${expected}, but received ${actual}`);
        err.expected = expected;
        err.actual = actual;
        throw err;
    }
}

export function assertTrue(condition: any, message?: string) {
    if (!condition) {
        throw new Error(message || 'Expected condition to be true, but received falsy value');
    }
}

export function assertDefined(value: any, message?: string) {
    if (value === undefined || value === null) {
        throw new Error(message || 'Expected value to be defined, but received null/undefined');
    }
}

export function assertArrayIncludes(arr: any[], item: any, message?: string) {
    if (!arr.includes(item)) {
        throw new Error(message || `Expected array to include ${item}`);
    }
}
