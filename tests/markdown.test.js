import { describe, it, expect, beforeAll } from 'vitest';

describe('Markdown & LaTeX Math Formatter', () => {
    let renderMarkdownToHtml;
    let formatMathFormula;

    beforeAll(async () => {
        const mod = await import('../js/modules/markdown.js');
        renderMarkdownToHtml = mod.renderMarkdownToHtml || globalThis.renderMarkdownToHtml;
        formatMathFormula = mod.formatMathFormula || globalThis.formatMathFormula;
    });

    describe('formatMathFormula', () => {
        it('formats Greek letters, subscripts, and superscripts', () => {
            const math = '\\alpha + x^2 + y_1';
            const formatted = formatMathFormula(math);
            expect(formatted).toContain('α');
            expect(formatted).toContain('<sup>2</sup>');
            expect(formatted).toContain('<sub>1</sub>');
        });
    });

    describe('renderMarkdownToHtml', () => {
        it('renders headings, bold, and code blocks', () => {
            const md = '# Physics Notes\n**Newtonian Mechanics** with `F = ma`';
            const html = renderMarkdownToHtml(md);
            expect(html).toContain('<h1');
            expect(html).toContain('Newtonian Mechanics');
            expect(html).toContain('<strong');
            expect(html).toContain('<code');
        });

        it('renders inline math and display math equations', () => {
            const md = 'Mass-energy equivalence is $E = mc^2$.\n$$\\int x dx = \\frac{1}{2}x^2$$';
            const html = renderMarkdownToHtml(md);
            expect(html).toContain('<sup>2</sup>');
            expect(html).toContain('∫');
        });
    });
});
