// ============================================================
// Adaptive Learning Sample Decks
// Medical Genetics & Bioinformatics flashcards
// ============================================================

import { Deck, Card, generateId } from '../core/models';

function card(
  deckId: string,
  front: string,
  back: string,
  complexity: Card['complexity'] = 'concept',
  tags: string[] = [],
  presentations?: Card['presentations'],
): Card {
  return {
    id: generateId(),
    deckId,
    front,
    back,
    complexity,
    tags,
    presentations,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function createSampleDecks(): Deck[] {
  const deck1Id = generateId();
  const deck2Id = generateId();
  const deck3Id = generateId();

  const medicalGenetics: Deck = {
    id: deck1Id,
    name: 'Medical Genetics',
    description: 'ACMG variant interpretation, NGS concepts, and clinical genomics',
    cards: [
      card(deck1Id, 'What are the 5 ACMG variant classification categories?',
        'Pathogenic, Likely Pathogenic, Variant of Uncertain Significance (VUS), Likely Benign, Benign',
        'vocabulary', ['ACMG', 'variant-interpretation'],
        {
          mnemonic: {
            front: 'Mnemonic for the 5 ACMG variant classification categories?',
            back: 'P-LP-VUS-LB-B: "Please Let Very Unusual Samples Look Beautiful" — Pathogenic, Likely Pathogenic, VUS, Likely Benign, Benign',
          },
          analogy: {
            front: 'If variant classification were a courtroom verdict, what would the 5 ACMG categories be?',
            back: 'Guilty (Pathogenic), Probably Guilty (Likely Pathogenic), Hung Jury (VUS), Probably Innocent (Likely Benign), Innocent (Benign)',
          },
        },
      ),
      card(deck1Id, 'What is the minimum allele frequency threshold that typically rules out a variant as pathogenic for a rare Mendelian disease?',
        '> 5% in any population in gnomAD — too common to cause a rare disease (prevalence < 1/10,000)',
        'application', ['ACMG', 'population-genetics'],
      ),
      card(deck1Id, 'What is the difference between germline and somatic variants?',
        'Germline: inherited, present in every cell, passed to offspring. Somatic: acquired post-fertilization, only in affected tissue lineage, not inherited.',
        'concept', ['genetics-fundamentals'],
        {
          contrast: {
            front: 'Compare germline vs somatic variants across: inheritance, distribution, and clinical testing.',
            back: 'Germline: inherited from parent, in all cells, tested via blood/saliva. Somatic: acquired, only in tumor/affected tissue, tested via tissue biopsy. Key: cancer can have both!',
          },
        },
      ),
      card(deck1Id, 'What does NGS stand for and what are its key steps?',
        'Next-Generation Sequencing. Steps: Library prep → Cluster amplification → Sequencing by synthesis → Data analysis (alignment, variant calling, annotation)',
        'procedure', ['NGS'],
        {
          'step-by-step': {
            front: 'Walk through the NGS pipeline from sample to variant call.',
            back: '1. DNA extraction → 2. Fragmentation & adapter ligation (library prep) → 3. Cluster amplification on flow cell → 4. Sequencing by synthesis (fluorescent nucleotides) → 5. Base calling → 6. Read alignment to reference → 7. Variant calling → 8. Annotation & filtering',
          },
        },
      ),
      card(deck1Id, 'What is linkage disequilibrium (LD)?',
        'Non-random association of alleles at different loci. Variants close together on a chromosome tend to be inherited together. Measured by r² (0-1). Important for GWAS tag SNP selection.',
        'concept', ['population-genetics'],
      ),
      card(deck1Id, 'What is a compound heterozygote?',
        'An individual with two different pathogenic variants in the same gene, one on each allele (one from each parent). Causes autosomal recessive disease without homozygosity.',
        'concept', ['inheritance-patterns'],
      ),
      card(deck1Id, 'What is the Hardy-Weinberg equation?',
        'p² + 2pq + q² = 1, where p = frequency of dominant allele, q = frequency of recessive allele. Used to estimate carrier frequency from disease prevalence.',
        'application', ['population-genetics'],
        {
          example: {
            front: 'If cystic fibrosis affects 1/2500 Caucasians, what is the carrier frequency using Hardy-Weinberg?',
            back: 'q² = 1/2500, so q = 1/50. Carrier frequency (2pq) ≈ 2 × (49/50) × (1/50) ≈ 1/25 or 4%. About 1 in 25 Caucasians carry a CF allele.',
          },
        },
      ),
      card(deck1Id, 'What is the difference between sensitivity and specificity in genetic testing?',
        'Sensitivity = true positive rate (% of affected individuals correctly identified). Specificity = true negative rate (% of unaffected individuals correctly excluded). Trade-off: increasing one often decreases the other.',
        'concept', ['clinical-testing'],
      ),
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const bioinformatics: Deck = {
    id: deck2Id,
    name: 'Bioinformatics Fundamentals',
    description: 'Core bioinformatics concepts, algorithms, and tools',
    cards: [
      card(deck2Id, 'What is a FASTQ file?',
        'Text-based format for storing both nucleotide sequences AND their quality scores. Each read has 4 lines: @header, sequence, +separator, quality (Phred+33 ASCII)',
        'vocabulary', ['file-formats'],
      ),
      card(deck2Id, 'What is the Phred quality score and what does Q30 mean?',
        'Q = -10 × log₁₀(P_error). Q30 means 1 in 1000 chance of error (99.9% accuracy). Q20 = 1 in 100 (99%). Industry standard: most bases should be ≥ Q30.',
        'application', ['quality-metrics'],
      ),
      card(deck2Id, 'What is the Burrows-Wheeler Transform used for in bioinformatics?',
        'Enables efficient read alignment. BWT compresses the reference genome into an FM-index, allowing O(n) substring matching. Used by BWA and Bowtie2 aligners.',
        'concept', ['algorithms'],
      ),
      card(deck2Id, 'What is a VCF file?',
        'Variant Call Format. Stores genetic variants relative to a reference genome. Key columns: CHROM, POS, ID, REF, ALT, QUAL, FILTER, INFO, FORMAT, and sample genotypes.',
        'vocabulary', ['file-formats'],
      ),
      card(deck2Id, 'What is the difference between alignment and assembly?',
        'Alignment: map reads to an existing reference genome (faster, needs reference). Assembly: reconstruct genome de novo from overlapping reads (slower, no reference needed).',
        'concept', ['methods'],
      ),
      card(deck2Id, 'What is a Manhattan plot and when is it used?',
        'A plot showing -log₁₀(p-value) of genetic variants across chromosomes. Used in GWAS to identify genomic regions associated with a trait. Significant SNPs appear as tall peaks.',
        'concept', ['GWAS', 'visualization'],
      ),
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const mlHealthTech: Deck = {
    id: deck3Id,
    name: 'ML for Health Tech',
    description: 'Machine learning concepts applied to health and biometrics',
    cards: [
      card(deck3Id, 'What is gradient boosting and why is it useful for tabular health data?',
        'Ensemble method that sequentially adds weak learners (trees) to correct previous errors. Excels on tabular data (vital signs, lab values) because it handles mixed features, missing data, and non-linear relationships. XGBoost/LightGBM are top choices.',
        'concept', ['ML-algorithms'],
      ),
      card(deck3Id, 'What is Heart Rate Variability (HRV) and why does it matter for cognitive performance?',
        'Time variation between heartbeats (R-R intervals). Higher HRV = better parasympathetic tone = lower stress = better cognitive function. Low HRV correlates with fatigue, stress, and impaired memory encoding.',
        'concept', ['biometrics'],
      ),
      card(deck3Id, 'What is spaced repetition and what is the forgetting curve?',
        'Ebbinghaus forgetting curve: memory decays exponentially without review. Spaced repetition schedules reviews at increasing intervals to interrupt decay at optimal points, converting short-term to long-term memory.',
        'concept', ['learning-science'],
      ),
      card(deck3Id, 'What is the difference between supervised and unsupervised learning?',
        'Supervised: labeled data, predicts known outcomes (classification/regression). Unsupervised: unlabeled data, finds hidden patterns (clustering/dimensionality reduction). Health example: supervised = predicting readmission; unsupervised = patient subtyping.',
        'concept', ['ML-fundamentals'],
      ),
      card(deck3Id, 'What is cross-validation and why use k-fold?',
        'Technique to estimate model performance on unseen data. K-fold: split data into k subsets, train on k-1, test on 1, rotate. Reduces overfitting risk and gives reliable performance estimates. Standard: k=5 or k=10.',
        'procedure', ['ML-evaluation'],
      ),
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return [medicalGenetics, bioinformatics, mlHealthTech];
}
