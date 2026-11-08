import 'package:flutter_test/flutter_test.dart';
import 'package:healthy_flutter_app/main.dart';

void main() {
  testWidgets('App renders correctly', (WidgetTester tester) async {
    await tester.pumpWidget(const MyApp());
    expect(find.text('Healthy Flutter'), findsOneWidget);
  });
}
