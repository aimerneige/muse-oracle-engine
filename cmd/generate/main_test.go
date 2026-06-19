package main

import (
	"reflect"
	"testing"
)

func TestParseStorySelection(t *testing.T) {
	t.Parallel()

	got, err := parseStorySelection("1, 3,4\n")
	if err != nil {
		t.Fatalf("parseStorySelection returned error: %v", err)
	}
	want := []int{1, 3, 4}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected %v, got %v", want, got)
	}
}

func TestParseStorySelectionRejectsInvalidInput(t *testing.T) {
	t.Parallel()

	for _, input := range []string{"", "1,,3", "0", "one"} {
		if _, err := parseStorySelection(input); err == nil {
			t.Fatalf("expected %q to be rejected", input)
		}
	}
}
