# Test data: NYC yellow taxi trips, January 2024 (Parquet)

Test-only branch, never merged into main. Public data from the NYC Taxi and Limousine Commission (https://www.nyc.gov/site/tlc/about/tlc-trip-record-data.page).

- taxi/yellow_tripdata_2024-01.parquet: the full file, 49,961,641 bytes (original, unchanged).
- taxi/taxi-one-row-group.parquet: 17,615,874 bytes; the first row group (1,048,576 rows x 19 columns) of the file above with its footer rewritten.
