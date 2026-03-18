
const testParcelName = (textValue) => {
    const valid = textValue.match(/(FINCA|_MOD|PARCELA|FR-|REF|RECINTO)/i) || textValue.trim().length === 14;
    let name = null;
    if (valid) {
        name = textValue.trim().replace(/\s/g, "");
    }
    return name;
};

const testCases = [
    { input: "PARCELA 1", expected: "PARCELA1" },
    { input: "REFERENCE12345", expected: "REFERENCE12345" }, // 14 chars
    { input: "ABCDEFGHIJKLMN", expected: "ABCDEFGHIJKLMN" }, // 14 chars
    { input: "12345678901234", expected: "12345678901234" }, // 14 chars
    { input: "  12345678901234  ", expected: "12345678901234" }, // 14 chars with spaces
    { input: "SHORT", expected: null },
    { input: "FINCA", expected: "FINCA" },
    { input: "NOT_A_MATCH", expected: null }
];

testCases.forEach(tc => {
    const result = testParcelName(tc.input);
    console.log(`Input: "${tc.input}" | Expected: ${tc.expected} | Result: ${result} | ${result === tc.expected ? "PASS" : "FAIL"}`);
});
