import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

const apiSecret = "super-secret-flutter-api-token-xyz-12345";

void main() {
  runApp(const DefectiveApp());
}

class DefectiveApp extends StatefulWidget {
  const DefectiveApp({Key? key}) : super(key: key);

  @override
  State<DefectiveApp> createState() => _DefectiveAppState();
}

class _DefectiveAppState extends State<DefectiveApp> {
  final TextEditingController _searchController = TextEditingController();

  Future<void> _login(String token) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('token', token);
  }

  // Missing dispose() method causes memory leaks

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        body: TextField(controller: _searchController),
      ),
    );
  }
}
