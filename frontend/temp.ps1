(Get-Content src/data/mockData.js) -replace '\t\tmodules: \[', '\t\tlessons: [' -replace '\t\tlessons: \[\],','' | Set-Content src/data/mockData.js
